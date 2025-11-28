# Fire Interview Coach - Backend API

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `env.example` to `.env`:
```bash
cp env.example .env
```

3. Fill in your API keys in `.env`:
- `OPENAI_API_KEY` - Your OpenAI API key
- `MAPBOX_TOKEN` - Your Mapbox API token (for city/location search)
- `FRONTEND_URL` - Your frontend URL (for CORS)
- `PORT` - Server port (default: 3001)

4. Start the server:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/mapbox-token` - Get Mapbox API token (for frontend)
- `GET /api/mapbox-search` - Proxy Mapbox search requests (avoids CORS)
- `POST /api/question` - Generate interview question
- `POST /api/followup` - Generate follow-up question
- `POST /api/analyze-answer` - Analyze candidate's answer
- `POST /api/parse-resume` - Parse resume with AI
- `POST /api/tts` - Text-to-speech (ElevenLabs)

## Environment Variables

All sensitive keys are stored in `.env` file (not committed to git).
