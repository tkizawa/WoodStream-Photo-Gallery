const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4173;
const DIST_DIR = path.join(__dirname, 'dist');

app.use(express.static(DIST_DIR));

app.listen(PORT, () => {
  console.log(`\n==========================================`);
  console.log(`Static Preview Server running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Serving: ${DIST_DIR}`);
  console.log(`==========================================\n`);
});
