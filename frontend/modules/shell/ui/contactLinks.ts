import type { ComponentType, SVGProps } from "react";
import type { BrandInfo } from "@/lib/brand";
import { FacebookIcon, InstagramIcon, LinkedInIcon, TikTokIcon, YouTubeIcon } from "@/design-system/icons/BrandIcons";

interface SocialLink {
  id: "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin";
  name: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** The store's social profiles, in display order. A profile with no link is left out. */
export function socialLinks(brand: BrandInfo): SocialLink[] {
  const all: SocialLink[] = [
    { id: "facebook", name: "Facebook", href: brand.facebook, icon: FacebookIcon },
    { id: "instagram", name: "Instagram", href: brand.social.instagram, icon: InstagramIcon },
    { id: "tiktok", name: "TikTok", href: brand.social.tiktok, icon: TikTokIcon },
    { id: "youtube", name: "YouTube", href: brand.social.youtube, icon: YouTubeIcon },
    { id: "linkedin", name: "LinkedIn", href: brand.social.linkedin, icon: LinkedInIcon },
  ];
  return all.filter((link) => link.href);
}

/** The store's own Google Maps link when the profile has one, otherwise a Maps search for the address. */
export function mapsHref(brand: BrandInfo, address: string): string {
  return brand.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
