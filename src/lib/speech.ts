"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Web Speech API hook (français), partagé entre la conciergerie des
 * questions et celle de la newsletter. Dégradé silencieux quand le
 * navigateur ne supporte pas (Firefox notamment).
 */

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};
type SRConstructor = new () => SR;

export function useSpeechRecognition({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SR | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = "fr-FR";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = "";
      const results = e.results;
      for (let i = 0; i < results.length; i++) {
        text += results[i][0].transcript;
      }
      onTranscript(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    return () => {
      r.stop();
      recognitionRef.current = null;
    };
  }, [onTranscript]);

  function start() {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.start();
      setListening(true);
    } catch {
      // Already started — Web Speech jette quand on appelle start() en double.
    }
  }
  function stop() {
    const r = recognitionRef.current;
    if (!r) return;
    r.stop();
    setListening(false);
  }

  return { supported, listening, start, stop };
}
