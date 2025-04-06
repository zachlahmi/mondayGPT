// server.js
const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

app.use(express.json());

const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
const BOARD_MAPPING = JSON.parse(process.env.BOARD_MAPPING || '{}');

const mondayHeaders = {
  'Content-Type': 'application/json',
  Authorization: MONDAY_API_KEY
};

app.post('/gpt-to-monday', async (req, res) => {
  const { boardName, name, updateText, columns } = req.body;
  const boardId = BOARD_MAPPING[boardName];

  if (!boardId) {
    return res.status(400).json({ error: `Board name '${boardName}' not found in mapping.` });
  }

  try {
    // Recherche s'il existe déjà un item avec le même nom (clé unique: prénom + nom dans le champ "name")
    let existingItemId = null;

    if (name) {
      const searchQuery = {
        query: `
          query {
            items_by_column_values(
              board_id: ${boardId},
              column_id: "name",
              column_value: "${name}"
            ) {
              id
              name
            }
          }
        `
      };

      const searchResp = await axios.post('https://api.monday.com/v2', searchQuery, { headers: mondayHeaders });
      const items = searchResp.data.data.items_by_column_values;
      if (items.length > 0) {
        existingItemId = items[0].id;
      }
    }

    let itemId = existingItemId;

    if (existingItemId) {
      // Mise à jour des colonnes
      const updateCols = {
        query: `
          mutation {
            change_multiple_column_values(
              board_id: ${boardId},
              item_id: ${existingItemId},
              column_values: "${JSON.stringify(columns).replace(/"/g, '\\"')}"
            ) {
              id
            }
          }
        `
      };

      await axios.post('https://api.monday.com/v2', updateCols, { headers: mondayHeaders });
    } else {
      // Création d'un nouvel item
      const createQuery = {
        query: `
          mutation {
            create_item (
              board_id: ${boardId},
              item_name: "${name}",
              column_values: "${JSON.stringify(columns).replace(/"/g, '\\"')}"
            ) {
              id
            }
          }
        `
      };

      const createResp = await axios.post('https://api.monday.com/v2', createQuery, { headers: mondayHeaders });
      itemId = createResp.data.data.create_item.id;
    }

    // Ajout d'un update
    const updateQuery = {
      query: `
        mutation {
          create_update (item_id: ${itemId}, body: "${updateText}") {
            id
          }
        }
      `
    };

    await axios.post('https://api.monday.com/v2', updateQuery, { headers: mondayHeaders });

    res.status(200).json({ message: existingItemId ? 'Item mis à jour.' : 'Item créé et update ajouté.' });

  } catch (err) {
    const errorDetail = err.response?.data || err.message || err;
    console.error('Erreur API Monday:', errorDetail);
    res.status(500).json({ error: errorDetail });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`✅ Serveur lancé sur le port ${PORT}`));
