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
    res.json({
      userData, 
      chatList, 
    });
  } catch (error) {
    console.error('Login failed:', error); 
    res.status(400).json({ error: 'Invalid login credentials' }); 
  }
});

app.get('/chats/:thread_id', async (req, res) => {
  const { thread_id } = req.params; 
  const thread = igClient.entity.directThread();
  try {
    const threadF = await igClient.feed.directThread(thread);
    threadF.cursor = undefined;
    threadF.id = thread_id;
    threadF.request().then((response) => {
      res.json(response.thread); 
      return response.thread;     
    }).catch((error) => {
      console.error("Error:", error); 
    });
  } catch (error) {
    console.error('Failed to fetch chat list:', error); 
    res.status(500).json({ error: 'Failed to retrieve chat list' }); 
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`); 
});
