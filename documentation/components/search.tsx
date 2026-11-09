'use client';

import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';

// Static export has no search server, so the dialog runs a client-side static
// index search. fumadocs-ui's DefaultSearchDialog is hardwired to the fetch
// client, so we provide a custom dialog backed by the static client. `from`
// mirrors the basePath-aware static index emitted by app/api/search.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function StaticSearchDialog(props: SharedProps) {
  const { search, setSearch, query } = useDocsSearch({
    type: 'static',
    from: `${basePath}/api/search`,
  });

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
