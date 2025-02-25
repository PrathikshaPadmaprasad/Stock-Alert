const AWS = require("aws-sdk");
const sns = new AWS.SNS();

const dynamoDB = new AWS.DynamoDB.DocumentClient();

const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

exports.lambdaHandler = async (event) => {
  try {
    const requestBody = JSON.parse(event.body);
    const { username, stockSymbol, threshold, email, alertCondition } =
      requestBody;

    if (!username || !stockSymbol || !threshold || !email || !alertCondition) {
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
        AlertCondition: alertCondition,
      },
    };

    await dynamoDB.put(putParams).promise();

    // Generate a unique SNS topic ARN for the user
    const userTopicName = `StockAlert-${username}`;
    const createTopicParams = { Name: userTopicName };
    const snsTopic = await sns.createTopic(createTopicParams).promise();
    const snsTopicArn = snsTopic.TopicArn;

    // Store the SNS topic ARN in DynamoDB as well
    const updateParams = {
      TableName: "UserStockThresholds",
      Key: {
        Username: username,
        StockSymbol: stockSymbol.toUpperCase(),
      },
      UpdateExpression: "SET SNS_TOPIC_ARN = :snsTopicArn",
      ExpressionAttributeValues: {
        ":snsTopicArn": snsTopicArn,
      },
    };
    await dynamoDB.update(updateParams).promise();

    // Subscribe the user to their SNS topic
    const subscribeParams = {
      Protocol: "email",
      TopicArn: snsTopicArn,
      Endpoint: email,
    };

    await sns.subscribe(subscribeParams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Stock alert set successfully & user subscribed to SNS!!",
        snsTopicArn: snsTopicArn,
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
