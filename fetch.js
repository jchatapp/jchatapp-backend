const { IgApiClient } = require('instagram-private-api'); // Import the Instagram Private API
const readline = require('readline'); // For user input

const igClient = new IgApiClient(); // Create an instance of the Instagram API client

// Utility function to prompt user input
const prompt = (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Function to retrieve chat list and get the first chat ID
const getFirstChatId = async () => {
  const chatFeed = igClient.feed.directInbox(); // Fetch the direct inbox
  const chatList = await chatFeed.items(); // Get the list of chats

  if (chatList.length === 0) {
    throw new Error('No chats found'); // Handle case when there are no chats
  }

  return chatList[0].thread_id; // Return the `thread_id` of the first chat
};

// Function to fetch messages from a specific chat by ID
const getChatMessages = async (chatId) => {
  const threadFeed = igClient.feed.directThread({ id: chatId }); // Create a direct thread
  const thread = await threadFeed.request(); // Fetch the thread
  return thread.items; // Retrieve the list of messages
};

// Main function to log in and fetch chat history
const loginAndFetchChatHistory = async () => {
  const username = await prompt('Enter Instagram username: '); // Get Instagram username
  const password = await prompt('Enter Instagram password: '); // Get Instagram password

  igClient.state.generateDevice(username); // Set up the Instagram device

  try {
    await igClient.simulate.preLoginFlow(); // Simulate pre-login flow
    await igClient.account.login(username, password); // Perform login
    console.log('Logged in successfully'); // Confirm successful login

    const chatId = await getFirstChatId(); // Get the ID of the first chat
    const messages = await getChatMessages(chatId); // Fetch messages from the first chat

    console.log('Chat history:'); // Display the retrieved chat history
    console.log(JSON.stringify(messages, null, 2)); // Output messages in a readable format
  } catch (error) {
    console.error('Error during login or fetching chat history:', error); // Handle errors
  }
};

// Run the main function
loginAndFetchChatHistory();
