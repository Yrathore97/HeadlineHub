export interface Article {
  id: string;
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  source: string;
  category: string;
  publishedAt: string;
}
