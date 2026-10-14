"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { appearanceCss, needsPanels, type Appearance } from "@/lib/appearance";

export type BgImage = { path: string; url: string };

type Ctx = {
  /** gespeicherte Darstellung (null = Standard) */
  saved: Appearance | null;
  savedImage: BgImage | null;
  /** was gerade angezeigt wird – beim Einstellen live, sonst = gespeichert */
  live: Appearance | null;
  liveImage: BgImage | null;
  setLive: (a: Appearance | null) => void;
  setLiveImage: (img: BgImage | null) => void;
  markSaved: (a: Appearance | null, img: BgImage | null) => void;
};

const AppearanceContext = createContext<Ctx | null>(null);

export function useAppearance() {
  const c = useContext(AppearanceContext);
  if (!c) throw new Error("useAppearance außerhalb von AppearanceProvider");
  return c;
}

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap";

export function AppearanceProvider({
  initial,
  initialImage,
  children,
}: {
  initial: Appearance | null;
  initialImage: BgImage | null;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState(initial);
  const [savedImage, setSavedImage] = useState(initialImage);
  const [live, setLive] = useState(initial);
  const [liveImage, setLiveImage] = useState(initialImage);

  // Neuer Bildpfad vom Server (z. B. anderes Gerät) übernehmen – gleiche Datei nicht neu laden
  const initialPath = initialImage?.path ?? null;
  useEffect(() => {
    if ((savedImage?.path ?? null) !== initialPath) {
      setSavedImage(initialImage);
      setLiveImage(initialImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  // Runde Schrift nur laden, wenn sie gebraucht wird
  useEffect(() => {
    if (live?.font !== "rund" || document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_HREF;
    document.head.appendChild(l);
  }, [live?.font]);

  const css = useMemo(() => (live ? appearanceCss(live, liveImage?.url ?? null) : ""), [live, liveImage]);

  const value = useMemo<Ctx>(
    () => ({
      saved,
      savedImage,
      live,
      liveImage,
      setLive,
      setLiveImage,
      markSaved: (a, img) => {
        setSaved(a);
        setSavedImage(img);
        setLive(a);
        setLiveImage(img);
      },
    }),
    [saved, savedImage, live, liveImage],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {/* Werte sind geprüft (nur Hex-Farben, Zahlen, Bild-URL ohne Anführungszeichen) */}
      {live && <style dangerouslySetInnerHTML={{ __html: css.replace(/</g, "\\3c ") }} />}
      <div
        className={live ? "pr-scope min-h-screen" : "min-h-screen"}
        data-border={live?.border ?? undefined}
        data-tilt={live?.tilt ? "1" : undefined}
        data-panels={live && needsPanels(live, !!liveImage) ? "1" : undefined}
      >
        {children}
      </div>
    </AppearanceContext.Provider>
  );
}
