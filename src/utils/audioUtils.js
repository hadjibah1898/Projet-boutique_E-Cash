/**
 * Utilitaire pour les notifications sonores de l'application.
 * Utilise l'API Web Audio native pour éviter de charger des fichiers audio externes.
 */

/**
 * Joue une mélodie ascendante signifiant un succès (double bip)
 */
export const playSuccessSound = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;

        const playTone = (freq, startOffset, duration) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, now + startOffset);
            gainNode.gain.setValueAtTime(0.1, now + startOffset);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + startOffset + duration);
            oscillator.start(now + startOffset);
            oscillator.stop(now + startOffset + duration);
        };

        playTone(800, 0, 0.1); // Premier bip (Grave)
        playTone(1200, 0.15, 0.2); // Deuxième bip (Aigu)
    } catch (e) {
        console.error("Audio error", e);
    }
};

/**
 * Joue un bip simple (utilisé pour le scan de code-barres)
 */
export const playBeep = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        console.error("Audio error", e);
    }
};