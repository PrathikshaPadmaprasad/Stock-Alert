const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const axios = require("axios");

const dynamoDB = new DynamoDBClient({});
const sns = new SNSClient({});

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

exports.lambdaHandler = async () => {
  try {
    console.log("Lambda triggered by EventBridge (CloudWatch Scheduled Event)");

    //  Fetch all stock thresholds from DynamoDB
    const scanParams = { TableName: "UserStockThresholds" };
    // const data = await dynamoDB.scan(scanParams).promise();
    const data = await dynamoDB.send(new ScanCommand(scanParams));

    if (!data.Items || data.Items.length === 0) {
      console.log("No stock thresholds found in DynamoDB.");
      return { statusCode: 200, body: "No stock data available." };
    }

    // organize stock symbols and user alerts
    const stockWatchlist = {};
    data.Items.forEach((item) => {
      const { Username, StockSymbol, Threshold, Email, AlertCondition } = item;
      if (!stockWatchlist[StockSymbol]) stockWatchlist[StockSymbol] = [];
      stockWatchlist[StockSymbol].push({
        Username,
        Threshold,
        Email,
        AlertCondition,
      });
    });

    //  Fetch stock prices and compare with thresholds
    for (const stockSymbol of Object.keys(stockWatchlist)) {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${stockSymbol}&interval=5min&apikey=${ALPHA_VANTAGE_API_KEY}`;

      try {
        const response = await axios.get(url);
        const timeSeries = response.data["Time Series (5min)"];

        if (!timeSeries) {
          console.error(` No valid stock data for ${stockSymbol}`);
          continue;
        }

        // Get the latest stock price
        const latestTimestamp = Object.keys(timeSeries)[0];
        const stockPrice = parseFloat(timeSeries[latestTimestamp]["4. close"]);

        // Compare stock price with thresholds for each user
        for (const user of stockWatchlist[stockSymbol]) {
          const { Username, Threshold, Email, AlertCondition } = user;

          // Fetch the SNS_TOPIC_ARN from DynamoDB for each user
          const getTopicArnParams = {
            TableName: "UserStockThresholds",
            Key: {
              Username: Username,
              StockSymbol: stockSymbol,
            },
          };

          // Retrieve the stored SNS_TOPIC_ARN
          // const topicArnData = await dynamoDB.get(getTopicArnParams).promise();
          const topicArnData = await dynamoDB.send(
            new GetCommand(getTopicArnParams)
          );
          const snsTopicArn = topicArnData.Item.SNS_TOPIC_ARN;

          // Check if the alert condition is met and send the alert
          if (
            (AlertCondition === "above" && stockPrice > Threshold) ||
            (AlertCondition === "below" && stockPrice < Threshold)
          ) {
            const condition = stockPrice > Threshold ? "Above" : "Below";
            const message = `Stock Alert for ${Username}!\n\nStock: ${stockSymbol}\nThreshold: ${Threshold}\nCurrent Price: ${stockPrice}\nTimestamp: ${latestTimestamp}\nCondition: ${condition}`;

            // Publish alert to the user's SNS topic
            const publishCommand = new PublishCommand({
              Message: message,
              Subject: `Stock Alert: ${stockSymbol} (${condition})`,
              TopicArn: snsTopicArn,
            });

            await sns.send(publishCommand);

            console.log(`Sent alert for ${stockSymbol} - ${condition}`);
          }
        }
      } catch (error) {
        console.error(`Error fetching stock price for ${stockSymbol}:`, error);
      }
    }

    return { statusCode: 200, body: "Stock price check completed." };
  } catch (error) {
    console.error("⚠️ Error in Lambda execution:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Stock price check failed" }),
    };
  }
};
