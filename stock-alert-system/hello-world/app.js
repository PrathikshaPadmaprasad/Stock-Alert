const axios = require("axios");
const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS(); // Initialize the SNS client

exports.lambdaHandler = async (event) => {
  const stockSymbol = event.queryStringParameters.symbol; // Get stock symbol from query string
  const username = event.queryStringParameters.username; // Get username from query string
  const threshold = parseFloat(event.queryStringParameters.threshold); // Get threshold from query string
  const userEmail = event.queryStringParameters.email; // Get user's email from query string

  try {
    // 1. Update or store the threshold in DynamoDB using a single update operation
    const updateParams = {
      TableName: "UserStockThresholds",
      Key: {
        Username: username,
        StockSymbol: stockSymbol,
      },
      UpdateExpression: "SET Threshold = :threshold",
      ConditionExpression:
        "attribute_not_exists(Threshold) OR Threshold <> :threshold",
      ExpressionAttributeValues: {
        ":threshold": threshold,
      },
      ReturnValues: "ALL_NEW",
    };

    // Perform the update operation in DynamoDB
    const result = await dynamoDB.update(updateParams).promise();

    // 2. Create a unique SNS Topic for the user-stock combination
    const topicName = `StockAlert-${username}-${stockSymbol}`;
    const createTopicParams = {
      Name: topicName,
    };

    // Create SNS topic dynamically
    const snsTopic = await sns.createTopic(createTopicParams).promise();
    console.log("SNS Topic ARN:", snsTopic.TopicArn);

    // 3. Subscribe the user to this SNS topic (via email)
    const subscribeParams = {
      Protocol: "email", // Send alert via email
      TopicArn: snsTopic.TopicArn,
      Endpoint: userEmail, // User's email address
    };

    // Subscribe the user to the topic
    await sns.subscribe(subscribeParams).promise();
    console.log(`User ${username} subscribed to ${topicName}`);

    //4. Fetch API key from environment variables
    const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

    // Construct the Alpha Vantage API URL
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${stockSymbol}&interval=5min&apikey=${API_KEY}`;

    // Make the API request using axios
    const response = await axios.get(url);
    console.log("API response:", response.data);

    // Extract time series data
    const timeSeries = response.data["Time Series (5min)"];
    if (!timeSeries) {
      throw new Error("Invalid response from Alpha Vantage API");
    }

    // Get the latest timestamp and stock price
    const latestTimestamp = Object.keys(timeSeries)[0];
    const latestData = timeSeries[latestTimestamp];
    const stockPrice = parseFloat(latestData["4. close"]);

    let condition = "";
    // 5.Compare stock price with the threshold
    if (stockPrice > threshold) {
      condition = "Above";
    } else if (stockPrice < threshold) {
      condition = "Below";
    } else {
      condition = "Equal";
    }

    // 6. Publish an SNS alert for this user-stock combination if condition is met
    if (condition === "Above" || condition === "Below") {
      const message = `Hello ${username},\n\nThe stock price for ${stockSymbol} has reached your set threshold of ${userThreshold}. Current stock price: ${stockPrice}. Timestamp: ${latestTimestamp}\n\nCondition: ${condition}`;

      const snsParams = {
        Message: message,
        TopicArn: snsTopic.TopicArn, // The unique SNS topic ARN for the user-stock combination
      };

      // Publish message to SNS
      await sns.publish(snsParams).promise();
      console.log("Alert sent to SNS:", message);
    }

    // Return the formatted stock data
    return {
      statusCode: 200,
      body: JSON.stringify({
        symbol: stockSymbol,
        timestamp: latestTimestamp,
        stockPrice: stockPrice,
        threshold: userThreshold,
        condition: condition,
      }),
    };
  } catch (error) {
    console.error("Error fetching stock data:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch stock data" }),
    };
  }
};
