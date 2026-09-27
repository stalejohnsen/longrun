'use client'

// Spec 0001 E10: a generic error page with no internal details. The server logs the error.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <h1>Something went wrong</h1>
      <p>The request could not be completed. Try again in a moment.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </>
  )
}
