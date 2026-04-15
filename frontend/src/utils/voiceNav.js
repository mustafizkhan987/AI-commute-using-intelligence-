import { useState, useCallback, useRef } from 'react';

export const useVoiceNavigation = () => {
  const [isSupported] = useState('speechSynthesis' in window);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastSpokenText = useRef('');

  const speak = useCallback((text, force = false) => {
    if (!isSupported) return;

    // Avoid repeating the same phrase repeatedly right after another
    if (!force && lastSpokenText.current === text) return;
    
    // Attempt to cancel current utterance if it's new high priority instruction
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Voice tuning for clear directions
    utterance.rate = 1.0; 
    utterance.pitch = 1.1; 
    utterance.volume = 1.0;
    
    // Choose voice - prefer high quality OS voices 
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google UK English Female'));
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      console.warn('Voice navigation error', e);
      setIsSpeaking(false);
    };

    lastSpokenText.current = text;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      lastSpokenText.current = '';
    }
  }, [isSupported]);

  return { speak, stop, isSpeaking, isSupported };
};
