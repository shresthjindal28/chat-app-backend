import { OpenAI } from 'openai'

// Initialize OpenAI with error handling
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not defined in environment variables');
  }
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} catch (error) {
  console.error('Failed to initialize OpenAI client:', error);
}

export const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;
    
    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message format. Message must be a non-empty string.' });
    }
    
    // Validate OpenAI client
    if (!openai) {
      console.error('OpenAI client not initialized');
      return res.status(500).json({ error: 'AI service is not available at the moment' });
    }

    // Log request (for debugging)
    console.log(`Processing AI chat request: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }]
    });
    
    if (!completion.choices || completion.choices.length === 0) {
      return res.status(500).json({ error: 'No response from AI service' });
    }
    
    res.json({ reply: completion.choices[0].message.content });
    
  } catch (err) {
    // Log the detailed error
    console.error('AI chat error:', err);
    
    // Return a user-friendly error message
    if (err.response) {
      // OpenAI API error
      res.status(err.response.status || 400).json({ 
        error: `OpenAI API error: ${err.response.data.error.message || err.message}` 
      });
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Could not connect to AI service. Please try again later.' });
    } else {
      res.status(400).json({ error: err.message || 'An unknown error occurred' });
    }
  }
}
