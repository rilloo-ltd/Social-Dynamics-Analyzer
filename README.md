<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Social Dynamics Analyzer - WhatsApp Chat Analysis

A Next.js application that analyzes WhatsApp chat exports using AI to provide insights into social dynamics, romantic relationships, and group interactions.

## Features

- **Chat Upload & Analysis**: Upload WhatsApp chat exports (ZIP or TXT format)
- **AI-Powered Insights**: Uses Google's Gemini AI for deep conversation analysis
- **Privacy-First**: All chat participants are anonymized before processing
- **Multiple Analysis Types**:
  - Full chat analysis
  - Romantic dynamics
  - Group dynamics
  - Individual participant profiles
- **Admin Dashboard**: Track usage statistics and analytics

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **AI Model**: Google Gemini
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Authentication**: Firebase (for admin)

## Run Locally

**Prerequisites:** Node.js 18+ and npm

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Copy `.env.example` to `.env.local`
   - Set your `GEMINI_API_KEY` in `.env.local`
   - (Optional) Configure Firebase credentials for admin authentication

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   - Main app: http://localhost:3000
   - Admin dashboard: http://localhost:3000/admin

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── app/               # Next.js App Router
│   ├── api/          # API routes
│   ├── admin/        # Admin page
│   ├── layout.tsx    # Root layout
│   └── page.tsx      # Home page
├── components/       # React components
├── services/         # Business logic & AI services
├── lib/              # Utilities
├── types.ts          # TypeScript types
└── public/           # Static assets
```

## Environment Variables

Required:
- `GEMINI_API_KEY` - Your Google Gemini API key

Optional (for Firebase admin auth):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## License

MIT
