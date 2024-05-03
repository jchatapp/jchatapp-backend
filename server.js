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
    //const threadF = igClient.feed.directThread("340282366841710301244259478305561480978");
    //threadF.cursor = undefined;
    //threadF.id = "340282366841710301244259478305561480978";
    //console.log(threadF)
    //threadF.request().then((response) => {
    //  console.log(response.thread);  
   //   return response.thread;      
    //}).catch((error) => {
    //  console.error("Error:", error); 
    //});
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
    console.log(chatList)
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
