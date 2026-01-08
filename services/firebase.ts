
// This is a simplified setup for environments without module bundlers.
declare const firebase: any;

const firebaseConfig = {
  apiKey: "AIzaSyDuRLsuANi2GcVaqWYagjsLUYEXfMvYAa8",
  authDomain: "plan-new.firebaseapp.com",
  projectId: "plan-new",
  storageBucket: "plan-new.appspot.com", 
  messagingSenderId: "813652883021",
  appId: "1:813652883021:web:5a6b60cc661a10cf7dce04",
  measurementId: "G-6VBFEY7X5G"
};

let firestore: any;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    // New Firestore Settings for Cache (to avoid deprecation warning)
    firestore = firebase.firestore();
    
    // Attempting to use the recommended way if possible in this version, 
    // otherwise falling back to compat mode gracefully.
    try {
        firestore.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
        });
        
        firestore.enablePersistence({ synchronizeTabs: true }).catch((err: any) => {
            if (err.code === 'failed-precondition') {
                console.warn("Firestore Persistence: Failed (multiple tabs).");
            } else if (err.code === 'unimplemented') {
                console.warn("Firestore Persistence: Browser not supported.");
            }
        });
    } catch (settingError) {
        console.warn("Firestore Settings error:", settingError);
    }
} catch (e) {
    console.error("Firebase initialization error", e);
}

export { firestore };
