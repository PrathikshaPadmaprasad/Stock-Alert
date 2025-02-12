const axios = require("axios");
const AWS = require("aws-sdk");

exports.lambdaHandler = async (event) => {
  const stockSymbol = event.queryStringParameters.symbol; // Get stock symbol from query string
  const username = event.queryStringParameters.username; // Get username from query string
  const threshold = parseFloat(event.queryStringParameters.threshold); // Get threshold from query string

  try {
    // Fetch API key from environment variables
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

    // Compare stock price with the threshold
    let condition = "";
    if (stockPrice > userThreshold) {
      condition = "Above";
    } else if (stockPrice < userThreshold) {
      condition = "Below";
    } else {
      condition = "Equal";
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
