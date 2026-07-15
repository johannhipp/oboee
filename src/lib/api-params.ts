export const readTagParams = (searchParams: URLSearchParams) => {
  const tags = searchParams
    .getAll("tags")
    .flatMap((value) => value.split(","))
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
};
