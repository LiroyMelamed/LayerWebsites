import { ref, set, get, remove } from 'firebase/database';
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

export const setData = async (path, data) => {
  try {
    const dataRef = ref(database, path);
    await set(dataRef, data);
    return data;
  } catch (error) {
    console.error('Error setting data:', error);
    throw new Error(`Error setting data: ${error.message}`);
  }
};

export const removeData = async (path) => {
  try {
    const dataRef = ref(database, path);
    await remove(dataRef);
    return true;
  } catch (error) {
    console.error('Error removing data:', error);
    throw new Error(`Error removing data: ${error.message}`);
  }
};
