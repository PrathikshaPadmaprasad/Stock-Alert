const AWS = require("aws-sdk");
const sns = new AWS.SNS();

const dynamoDB = new AWS.DynamoDB.DocumentClient();

const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

exports.lambdaHandler = async (event) => {
  try {
    const requestBody = JSON.parse(event.body);
    const { username, stockSymbol, threshold, email } = requestBody;

    if (!username || !stockSymbol || !threshold || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Store user preference in DynamoDB
    const putParams = {
      TableName: "UserStockThresholds",
      Item: {
        Username: username,
        StockSymbol: stockSymbol.toUpperCase(),
        Threshold: parseFloat(threshold),
        Email: email,
      },
    };

    await dynamoDB.put(putParams).promise();

    const subscribeParams = {
      Protocol: "email", // User receives notifications via email
      TopicArn: SNS_TOPIC_ARN,
      Endpoint: email, // User's email address
    };

    await sns.subscribe(subscribeParams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Stock alert set successfully & user subscribed to SNS!!",
      }),
    };
  } catch (error) {
    console.error("Error storing user preferences:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to store stock alert" }),
    };
  }
};
