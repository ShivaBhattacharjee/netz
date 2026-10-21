import type { Locale, Product, TranslatableField } from "./types";

export interface Country {
  code: string;
  name: string;
  locale: Locale;
}

export const countries: Country[] = [
  { code: "GB", name: "United Kingdom", locale: "en" },
  { code: "US", name: "United States", locale: "en" },
  { code: "DE", name: "Germany", locale: "de" },
  { code: "AT", name: "Austria", locale: "de" },
  { code: "FR", name: "France", locale: "fr" },
  { code: "ES", name: "Spain", locale: "en" },
  { code: "IN", name: "India", locale: "en" },
];

export const defaultCountry = "DE";

export function countryFor(code: string | undefined): Country {
  return countries.find((c) => c.code === code?.toUpperCase()) ?? countries.find((c) => c.code === defaultCountry)!;
}

export const storeStrings: Record<Locale, Record<string, string>> = {
  en: {
    collection: "All products",
    products: "products",
    from: "From",
    addToCart: "Add to cart",
    unavailable: "Unavailable",
    details: "Details",
    care: "Care",
    material: "Material",
    color: "Colour",
    back: "All products",
    noPrice: "No price yet",
    shipsIn: "Ships in 2 to 4 working days",
  },
  de: {
    collection: "Alle Produkte",
    products: "Produkte",
    from: "Ab",
    addToCart: "In den Warenkorb",
    unavailable: "Nicht verfügbar",
    details: "Details",
    care: "Pflege",
    material: "Material",
    color: "Farbe",
    back: "Alle Produkte",
    noPrice: "Noch kein Preis",
    shipsIn: "Versand in 2 bis 4 Werktagen",
  },
  fr: {
    collection: "Tous les produits",
    products: "produits",
    from: "À partir de",
    addToCart: "Ajouter au panier",
    unavailable: "Indisponible",
    details: "Détails",
    care: "Entretien",
    material: "Matière",
    color: "Couleur",
    back: "Tous les produits",
    noPrice: "Pas encore de prix",
    shipsIn: "Expédié sous 2 à 4 jours ouvrés",
  },
};

export function localized(product: Product, locale: Locale, field: TranslatableField): string {
  if (locale === "en") return product[field];
  const t = product.translations[locale][field];
  return t.state === "missing" || !t.text ? product[field] : t.text;
}
