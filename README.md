<div align="center">

<img src="public/logo.png" alt="OpenLearn logo" width="120" />

# OpenLearn

**Free, offline-first study platform for exam prep.**

Browse exams → books → chapters, practice questions, and take timed mock tests — all in the browser, no login required.

[![Try it live](https://img.shields.io/badge/Try_it-Live_Demo-000?style=for-the-badge&logo=vercel)](https://open-learn-mrig.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

[**🚀 Live Demo → open-learn-mrig.vercel.app**](https://open-learn-mrig.vercel.app/)

</div>

---

## About the Project

OpenLearn is a full-stack study platform built for students preparing for **SSC, Banking and Railway** exams. It is designed to be **offline-first**: all your session state (progress, answers, saved questions, timers) lives in your browser via IndexedDB, so you can study without an account and without a connection. Log in optionally to sync your progress across devices.

### Features

- 📚 **Structured catalog** — navigate exams → books → chapters at your own pace
- ✍️ **Practice mode** — work through concepts and questions with instant solutions
- ⏱️ **Mock tests** — timed, full-screen exam simulations with configurable settings
- 🔖 **Saved questions** — bookmark tricky questions to revisit later
- 📈 **History** — review past sessions and results
- 🧮 **Math rendering** — full KaTeX support for inline (`$...$`) and block (`$$...$$`) math
- 📴 **Offline-first** — works fully in guest mode; optional cloud sync on login
- 📱 **Responsive** — mobile-friendly down to 375px

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router, TypeScript) |
| Database | Supabase (Postgres + Storage) |
| State | Zustand |
| Cache | Dexie.js (IndexedDB) |
| UI | shadcn/ui + Tailwind CSS |
| Math | KaTeX |
| Auth | Supabase Auth (optional — guest mode fully supported) |
| Hosting | Vercel |

---

## Run It Locally

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Supabase](https://supabase.com/) project (for catalog data + optional auth)

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/abhi8bit/openLearn.git
   cd openLearn
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env.local` file in the project root:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

   > Only the **anon** key is needed client-side. Never expose the service role key.

4. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Useful Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # Run ESLint
npm run type-check   # Type-check with tsc --noEmit
```

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
