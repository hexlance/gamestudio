# Tank.io - Multiplayer Tank Game 🚗💥

A simple real-time multiplayer tank battle game built with Node.js, Express, Socket.IO, and HTML5 Canvas.

## Features

- **Real-time multiplayer** - Multiple players can join and play simultaneously
- **Tank movement** - Smooth WASD controls with mouse aiming
- **Combat system** - Shoot bullets to damage other tanks
- **Health & scoring** - Track health, score points for eliminations
- **Responsive design** - Clean UI with real-time game stats
- **Instant respawn** - Get back into action immediately after being destroyed

## Setup Instructions

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone or download** this project to your computer

2. **Navigate to the project directory:**
   ```bash
   cd gamestudio
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

5. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

6. **Share with friends!** Give them your local IP address:
   ```
   http://YOUR_LOCAL_IP:3000
   ```
   
   To find your local IP:
   - **Windows:** Run `ipconfig` in Command Prompt
   - **Mac/Linux:** Run `ifconfig` or `ip addr` in Terminal

## How to Play

### Objective
Destroy other tanks to score points! The player with the highest score wins.

### Controls

| Control | Action |
|---------|--------|
| **W, A, S, D** | Move tank (forward, left, backward, right) |
| **Arrow Keys** | Alternative movement controls |
| **Mouse** | Aim your tank's turret |
| **Left Click** | Shoot bullets |
| **Spacebar** | Alternative shoot control |

### Gameplay Mechanics

- **Health:** Each tank starts with 100 health
- **Damage:** Each bullet hit deals 25 damage (4 hits to destroy)
- **Scoring:** Gain 1 point for each tank you destroy
- **Respawn:** When destroyed, you instantly respawn at a random location
- **Shooting:** There's a 300ms cooldown between shots to prevent spam
- **Player Limit:** Maximum 5 active players, additional players become spectators
- **Queue System:** Spectators automatically join when a player leaves

### Game Features

- **Real-time multiplayer:** See other players move and shoot in real-time
- **Visual feedback:** Health bars above tanks, score display, connection status
- **Collision detection:** Bullets accurately hit tanks
- **Boundary limits:** Tanks and bullets stay within the game area
- **Color coding:** Each player gets a unique color

## Technical Details

### Architecture
- **Backend:** Node.js with Express and Socket.IO for real-time communication
- **Frontend:** HTML5 Canvas for rendering, vanilla JavaScript for game logic
- **Communication:** WebSocket-based real-time updates at 60 FPS

### Game Constants
- Game area: 800x600 pixels
- Tank size: 30x30 pixels
- Tank speed: 3 pixels per frame
- Bullet speed: 8 pixels per frame
- Bullet size: 5x5 pixels

## Multiplayer Setup

### Local Network Play
1. Start the server on one computer
2. Find the host computer's local IP address
3. Other players connect to `http://HOST_IP:3000`
4. All players must be on the same network (WiFi/LAN)

### Public Internet Play

#### Option 1: Railway (Recommended - Free & Easy)
1. Create account at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Deploy with one click
4. Share the provided public URL with anyone!

#### Option 2: Render (Free Tier Available)
1. Create account at [render.com](https://render.com)
2. Create new "Web Service" from your GitHub repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Deploy and share the public URL

#### Option 3: Heroku
1. Install Heroku CLI
2. Run: `heroku create your-tank-game`
3. Run: `git push heroku main`
4. Share the Heroku app URL

#### Option 4: Port Forwarding (Advanced)
1. Set up port forwarding on your router (port 3000)
2. Use your public IP address
3. Share `http://YOUR_PUBLIC_IP:3000`

### Player Limit
- **Maximum 5 active players** can play simultaneously
- **Unlimited spectators** can watch and wait in queue
- When a player leaves, the next spectator automatically joins the game

## Troubleshooting

### Common Issues

**"Cannot connect to server"**
- Make sure the server is running (`npm start`)
- Check that you're using the correct IP address and port
- Ensure firewall isn't blocking the connection

**"Game feels laggy"**
- Check your internet connection
- Try reducing the number of players
- Close other bandwidth-heavy applications

**"Controls not working"**
- Click on the game canvas to focus it
- Make sure you're using the correct keys (WASD or Arrow keys)
- Try refreshing the page

### Performance Tips
- Close unnecessary browser tabs
- Use a modern browser (Chrome, Firefox, Safari, Edge)
- Ensure stable internet connection for best experience

## Development

### Project Structure
```
gamestudio/
├── server.js          # Main server file with game logic
├── package.json       # Node.js dependencies and scripts
├── public/
│   ├── index.html     # Game client HTML
│   └── game.js        # Client-side game logic
└── README.md          # This file
```

### Customization Ideas
- Adjust game constants in `server.js` (tank speed, bullet damage, etc.)
- Modify tank colors and appearance in `game.js`
- Add power-ups, different weapons, or game modes
- Implement teams or different tank types

## License

MIT License - Feel free to modify and distribute!

---

**Have fun playing Tank.io!** 🎮 
