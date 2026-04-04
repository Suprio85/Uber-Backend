import { app, server } from './app';

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS origin: ${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}`);
});
