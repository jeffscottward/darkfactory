import PublicLayout from "./(public)/layout.tsx";
import PublicNotFound from "./(public)/not-found.tsx";

// An unmatched URL renders this root not-found, as in Next.js (vinext 1.4 and
// later). The (public) not-found applies only to notFound() inside that group.
export default function RootNotFound() {
  return (
    <PublicLayout>
      <PublicNotFound />
    </PublicLayout>
  );
}
