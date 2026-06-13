import { appConfig } from "@/lib/config";

export type MarketplaceCategoryOption = {
  value: string;
  label: string;
};

export const DEFAULT_MARKETPLACE_CATEGORIES: MarketplaceCategoryOption[] = [
  { value: "lifestyle", label: "Lifestyle" },
  { value: "tech", label: "Tech & IT" },
  { value: "beauty", label: "Красота" },
  { value: "food", label: "Еда" },
  { value: "travel", label: "Путешествия" },
  { value: "fitness", label: "Фитнес" },
  { value: "gaming", label: "Игры" },
  { value: "education", label: "Образование" },
  { value: "business", label: "Бизнес" },
  { value: "entertainment", label: "Развлечения" },
  { value: "other", label: "Другое" },
];

export async function fetchMarketplaceCategories(): Promise<MarketplaceCategoryOption[]> {
  const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/categories`);
  if (!response.ok) {
    return DEFAULT_MARKETPLACE_CATEGORIES;
  }
  return response.json();
}
