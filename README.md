# RouteM8 🚚🗺️

RouteM8 is an intelligent peer-to-peer delivery matching platform connecting everyday travelers and commuters with senders who need packages delivered along existing travel routes.

## 🌟 Key Features

- **Route & Delivery Matching**: Match delivery requests with published journeys based on proximity, route corridors, detour times, and capacity.
- **Interactive Map Visualization**: Route visualization with Leaflet and Google Maps API support.
- **Real-time Status Tracking**: Monitor package status from request creation, driver assignment, pickup verification, in-transit updates, to completed drop-off.
- **Supabase Backend**: Integration with Supabase Authentication, PostgreSQL Database, Row-Level Security (RLS) policies, and Realtime event streaming.
- **Interactive UI**: Responsive desktop and mobile drawer views with rich dark/light UI tokens, animated transitions, and modals for creating requests and publishing journeys.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS with modern custom design system tokens & glassmorphism
- **Mapping**: Leaflet, `@vis.gl/react-google-maps`
- **Backend & Database**: Supabase (PostgreSQL, Realtime, Auth, RLS)
- **Icons**: Lucide React
- **Linter & Test**: Oxlint, Vitest, Happy-DOM

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/biradaradi19-max/RouteM8.git
   cd RouteM8
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env.local` and add your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

5. Run test suite:
   ```bash
   npm run test
   ```

## 📄 License

MIT
