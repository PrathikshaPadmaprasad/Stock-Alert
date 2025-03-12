const {
  SNSClient,
  CreateTopicCommand,
  SubscribeCommand,
  ListSubscriptionsByTopicCommand,
} = require("@aws-sdk/client-sns");
const {
  DynamoDBClient,
  PutCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const sns = new SNSClient({});
const dynamoDB = new DynamoDBClient({});
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

    // await dynamoDB.put(putParams).promise();
    await dynamoDB.send(new PutCommand(putParams));

    // Generate a unique SNS topic ARN for the user
    const userTopicName = `StockAlert-${username}`;
    const createTopicParams = { Name: userTopicName };
    // const snsTopic = await sns.createTopic(createTopicParams).promise();
    const snsTopic = await sns.send(new CreateTopicCommand(createTopicParams));
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
    // await dynamoDB.update(updateParams).promise();
    await dynamoDB.send(new UpdateCommand(updateParams));
    // Check if the user is already subscribed to the SNS topic
    const listSubscriptionsParams = {
      TopicArn: snsTopicArn,
    };

    // const subscriptionsResponse = await sns
    //   .listSubscriptionsByTopic(listSubscriptionsParams)
    //   .promise();

    const subscriptionsResponse = await sns.send(
      new ListSubscriptionsByTopicCommand(listSubscriptionsParams)
    );

    // Check if the email is already subscribed
    const existingSubscription = subscriptionsResponse.Subscriptions.find(
      (subscription) => subscription.Endpoint === email
    );

    if (!existingSubscription) {
      // Subscribe the user to their SNS topic
      const subscribeParams = {
        Protocol: "email",
        TopicArn: snsTopicArn,
        Endpoint: email,
      };

      // await sns.subscribe(subscribeParams).promise();
      await sns.send(new SubscribeCommand(subscribeParams));
      console.log(`User ${email} subscribed to ${snsTopicArn}`);
    } else {
      console.log(`User ${email} is already subscribed.`);
    }

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
