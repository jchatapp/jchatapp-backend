const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { IgApiClient } = require('instagram-private-api');
const igClient = new IgApiClient();

const app = express();
const port = 8000; 

app.use(bodyParser.json()); 
app.use(cors()); 

app.get('/health', (req, res) => {
  res.status(200).send('Server is running'); 
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    igClient.state.generateDevice(username); 
    await igClient.simulate.preLoginFlow(); 
    const userData = await igClient.account.login(username, password); 
    const chatList = await igClient.feed.directInbox().items();
    console.log(chatList)
    res.json({
      userData, 
      chatList, 
    });
  } catch (error) {
    console.error('Login failed:', error); 
    res.status(400).json({ error: 'Invalid login credentials' }); 
  }
});

app.get('/chats', async (req, res) => {
  try {
    const chatList = await igClient.feed.directInbox().items();
    res.json(chatList); 
  } catch (error) {
    console.error('Failed to fetch chat list:', error); 
    res.status(500).json({ error: 'Failed to retrieve chat list' });
  }
});

app.get('/chats/:chatId', async (req, res) => {
  const { chatId } = req.params;

  try {
    const threadFeed = igClient.feed.directThread({ id: chatId }); 
    const thread = await threadFeed.request(); 

    res.json(thread);
  } catch (error) {
    console.error('Failed to fetch chat:', error); 
    res.status(500).json({ error: 'Failed to retrieve chat' });
  }
});

app.get('/chats/:chatId/older', async (req, res) => {
  const { chatId } = req.params;

  try {
    let threadFeed = igClient.feed.directThread({ id: chatId }); 
    const messages = await threadFeed.items();

    res.json(messages);
  } catch (error) {
    console.error('Failed to fetch older messages:', error); 
    res.status(500).json({ error: 'Failed to retrieve older messages' }); 
}});

app.listen(port, () => {
  console.log(`Server running on port ${port}`); 
});
