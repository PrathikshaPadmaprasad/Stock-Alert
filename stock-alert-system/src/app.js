const axios = require("axios");
const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.lambdaHandler = async (event) => {
  const stockSymbol = event.queryStringParameters.symbol;
  const username = event.queryStringParameters.username;
  const threshold = parseFloat(event.queryStringParameters.threshold);
  const userEmail = event.queryStringParameters.email;

  try {
    // 1. Update or store the threshold in DynamoDB using a single update operation
    const putParams = {
      TableName: "UserStockThresholds",
      Item: {
        Username: username,
        StockSymbol: stockSymbol,
        Threshold: threshold,
      },
    };

    // Perform the update operation in DynamoDB
    const result = await dynamoDB.put(putParams).promise();
    console.log("✅ DynamoDB update result:", result);

    const topicName = `StockAlert-${username}-${stockSymbol}`;
    const listTopicsParams = {};

    // List all topics in SNS
    const topicsResponse = await sns.listTopics(listTopicsParams).promise();

    // Check if the topic exists by comparing the topic ARN
    let snsTopic;
    const existingTopic = topicsResponse.Topics.find((topic) =>
      topic.TopicArn.includes(topicName)
    );

    if (existingTopic) {
      snsTopic = existingTopic; // Use the existing topic
      console.log("Topic already exists:", snsTopic.TopicArn);
    } else {
      // Create SNS topic dynamically if it doesn't exist
      const createTopicParams = {
        Name: topicName,
      };

      snsTopic = await sns.createTopic(createTopicParams).promise();
      console.log("SNS Topic ARN:", snsTopic.TopicArn);
    }

    // 3. Subscribe the user to this SNS topic (via email)
    const subscribeParams = {
      Protocol: "email",
      TopicArn: snsTopic.TopicArn,
      Endpoint: userEmail,
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
      const message = `Hello ${username},\n\nThe stock price for ${stockSymbol} has reached your set threshold of ${threshold}. Current stock price: ${stockPrice}. Timestamp: ${latestTimestamp}\n\nCondition: ${condition}`;

      const snsParams = {
        Message: message,
        TopicArn: snsTopic.TopicArn,
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
        threshold: threshold,
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
