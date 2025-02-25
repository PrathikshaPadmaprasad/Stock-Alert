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

    const listSubscriptionsParams = {
      TopicArn: SNS_TOPIC_ARN,
    };
    const subscriptionsResponse = await sns
      .listSubscriptionsByTopic(listSubscriptionsParams)
      .promise();

    const existingSubscription = subscriptionsResponse.Subscriptions.find(
      (subscription) => subscription.Endpoint === email
    );

    if (existingSubscription) {
      console.log("User is already subscribed.");
    } else {
      const subscribeParams = {
        Protocol: "email",
        TopicArn: SNS_TOPIC_ARN,
        Endpoint: email,
      };

      await sns.subscribe(subscribeParams).promise();

      console.log(`User ${email} subscribed to ${SNS_TOPIC_ARN}`);
    }

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
