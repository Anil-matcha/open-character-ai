# Open Character AI 🤖✨

An open-source Character.AI alternative — an interactive, high-fidelity AI companion portal where users can explore preset personas, forge custom AI characters, fine-tune LLM parameters per chat, and purchase premium interaction credits.

![Open Character AI Screenshot](https://cdn.muapi.ai/data/2/566606463946/Screenshot_2026-05-19_174317.png)


## Related Projects

- [Open-Pomelli](https://github.com/SamurAIGPT/Open-Pomelli) — Open-source Pomelli alternative — self-hosted AI assistant platform
- [Open-Poe-AI](https://github.com/Anil-matcha/Open-Poe-AI) — Open-source Poe alternative — chat with multiple LLMs from one interface

## 🚀 Features

- **Futuristic Glassmorphic UI**: Premium dark mode design featuring interactive message bubbles, typing indicators, and LLM tuning sliders.
- **Dynamic Character Creation**: Forge custom personas with descriptions, greeting prompts, avatars, and a **Visibility Toggle** (Public vs. Private chat).
- **LLM Tuning Console**: Adjust model parameters (temperature, max tokens, reasoning mode) dynamically on each chat thread.
- **Secure Authentication**: Integration with NextAuth using Google OAuth login.
- **Premium Subscription & Credits**: Integrated Stripe billing to buy premium credits for advanced LLM telemetry.
- **Database Engine**: Prisma ORM connected to PostgreSQL for seamless syncing of chats, messages, and custom characters.

---

## 🛠️ Requirements

1. **Node.js** (v18.0.0 or higher)
2. **PostgreSQL Database** (e.g., hosted on Supabase)
3. **Google Developer Console Account** (for NextAuth Google Login)
4. **Stripe Developer Account** (for payment integrations)

---

## 💻 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Database Connection
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"

# NextAuth Settings
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your_nextauth_secret_key"

# Google OAuth Credentials
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# Muapi Api key
MU_API_KEY="your_openrouter_api_key"

# Stripe Billing Credentials
STRIPE_SECRET_KEY="your_stripe_secret_key"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="your_stripe_publishable_key"
STRIPE_WEBHOOK_SECRET="your_stripe_webhook_secret"
```

### 3. Initialize the Database Schema
Push the schema to your PostgreSQL database:
```bash
npx prisma db push
```

### 4. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the portal.

---

## 🔒 License
Distributed under the MIT License.
