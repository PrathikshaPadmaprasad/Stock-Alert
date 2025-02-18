const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB.DocumentClient();

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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Stock alert set successfully!" }),
    };
  } catch (error) {
    console.error("Error storing user preferences:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to store stock alert" }),
    };
  }
};
