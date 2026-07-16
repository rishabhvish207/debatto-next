import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Debatto",
    short_name: "Debatto",
    description: "AI-powered debate arena",
    start_url: "/",
    display: "standalone",
    background_color: "#13141a",
    theme_color: "#13141a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
