// src/services/apiUtils.js
import { ref, set, get } from 'firebase/database';
import { database } from './firebaseConfig';

export const getData = async (path) => {
  try {
    const dataRef = ref(database, path);
    const snapshot = await get(dataRef);
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    throw new Error(`Error fetching data: ${error.message}`);
  }
};

// Function to set data in the Firebase Realtime Database
export const setData = async (path, data) => {
    try {
      const dataRef = ref(database, path);
      await set(dataRef, data);
      return data; // Return the data that was set
    } catch (error) {
      console.error('Error setting data:', error);
      throw new Error(`Error setting data: ${error.message}`);
    }
  };

