# Deployment Guide - Fire Interview Coach

## Backend Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env`:

```bash
cp env.example .env
```

Edit `.env` and add your API keys:

```
OPENAI_API_KEY=sk-your-key-here
MAPBOX_TOKEN=pk.your-mapbox-token-here
FRONTEND_URL=https://yourdomain.com
PORT=3001
JWT_SECRET=your-strong-random-secret-key-here
STRIPE_SECRET_KEY=sk_test_your-stripe-key-here
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret-here
```

### 3. Start Backend Server

```bash
npm start
```

The server will run on `http://localhost:3001`

## Frontend Configuration

### Update Backend URL

In `index.html`, find this line (around line 1193):

```javascript
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'  // Local development
  : 'https://your-backend-url.com';  // Production - UPDATE THIS!
```

Replace `'https://your-backend-url.com'` with your actual backend URL.

## Deployment Options

### Option 1: Render.com (Recommended)

#### Backend:
1. Create new Web Service
2. Connect your GitHub repo
3. Set build command: `cd server && npm install`
4. Set start command: `cd server && npm start`
5. Add environment variables in Render dashboard:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `MAPBOX_TOKEN` - Your Mapbox token (for city/location search)
   - `FRONTEND_URL` - Your frontend URL (e.g., `https://your-app.onrender.com`)
   - `JWT_SECRET` - A strong random string for JWT token signing
   - `STRIPE_SECRET_KEY` - Your Stripe secret key (starts with `sk_test_` or `sk_live_`)
   - `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret (starts with `whsec_`)
   - `PORT` - Render will set this automatically, but you can use `10000` if needed
   - `NODE_ENV` - Set to `production`
   
   **Note:** See `DATA_STORAGE_AND_SECURITY.md` for detailed Stripe setup instructions.

#### Frontend:
1. Create new Static Site
2. Connect your GitHub repo
3. Set publish directory: `.` (root)
4. Update `BACKEND_URL` in `index.html` to your backend URL

### Option 2: Vercel

#### Backend:
1. Create `vercel.json` in `server/`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

2. Deploy: `vercel --cwd server`

#### Frontend:
1. Deploy static files to Vercel
2. Update `BACKEND_URL` in `index.html`

### Option 3: Railway

1. Create new project
2. Connect GitHub repo
3. Set root directory to `server/`
4. Add environment variables
5. Deploy

## Testing

1. Start backend: `cd server && npm start`
2. Open frontend in browser
3. Check browser console for API calls
4. Test all features:
   - Question generation
   - Follow-up questions
   - Answer analysis
   - Resume parsing
   - Text-to-speech

## Security Notes

- ✅ API keys are now server-side only
- ✅ Frontend never sees API keys
- ✅ Mapbox API calls are proxied through backend to avoid CORS issues
- ✅ CORS is configured for your frontend domain
- ✅ Environment variables are not committed to git
- ✅ Passwords are hashed with bcrypt (never stored in plain text)
- ✅ Payment processing handled by Stripe (no credit card data stored)

## Data Storage & Privacy

**See `DATA_STORAGE_AND_SECURITY.md` for complete details on:**
- What data is stored where
- Data confidentiality and security measures
- How user data is protected
- Stripe configuration details

## Recent Changes

- **Mapbox Integration**: City search now uses Mapbox API with backend proxy to avoid CORS errors
- **Old Location Data**: Removed dependency on countries-states-cities-database (now uses Mapbox + Nominatim fallback)

## Troubleshooting

### Backend not connecting:
- Check `BACKEND_URL` in `index.html`
- Verify CORS settings in `server/index.js`
- Check browser console for errors

### API errors:
- Verify API keys in `.env`
- Check server logs
- Ensure backend is running

### CORS errors:
- Update `FRONTEND_URL` in `.env`
- Check CORS configuration in `server/index.js`
