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

/** One page of results plus the token that fetches the next one.
 *  `nextPage` is null when there is no further page. */
export interface NewsPage {
  articles: Article[];
  nextPage: string | null;
}
