"use client";

// lib/speechToText.ts
//
// Thin wrapper around the browser's native SpeechRecognition — free, no
// backend, but support varies (solid on Chrome/Android, patchy-to-absent
// on Safari/iOS). `supported` lets callers hide the mic button entirely
// rather than show one that silently does nothing.

import { useEffect, useRef, useState } from "react";

export function useSpeechToText(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; });

  useEffect(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { setSupported(false); return; }
    setSupported(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join(" ");
      onResultRef.current(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;

    return () => { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; };
  }, []);

  function start() {
    if (!recognitionRef.current || listening) return;
    setListening(true);
    try { recognitionRef.current.start(); } catch { setListening(false); }
  }
  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return { listening, supported, start, stop };
}
