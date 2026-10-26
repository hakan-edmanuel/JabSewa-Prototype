import { useEffect, useRef, useState } from "react";
import { quoteRental } from "../../data/rentals";

/*
 * Kutipan harga server-side (quote_rental).
 * Harga/deposit/durasi/total SELALU dari server — bukan perhitungan client.
 */
export function useRentalQuote({ listingId, startDate, endDate, quantity }) {
  const [quote, setQuote] = useState(null);
  const [quoteState, setQuoteState] = useState("idle"); // idle|loading|error
  const quoteSeq = useRef(0);

  useEffect(() => {
    if (!startDate || !endDate) {
      Promise.resolve().then(() => {
        setQuote(null);
        setQuoteState("idle");
      });
      return undefined;
    }
    const seq = ++quoteSeq.current;
    Promise.resolve().then(() => setQuoteState("loading"));
    quoteRental({
      startDate,
      endDate,
      items: [{ listing_id: listingId, quantity }],
    })
      .then((res) => {
        if (quoteSeq.current !== seq) return;
        setQuote(res);
        setQuoteState(res?.ok ? "ready" : "error");
      })
      .catch(() => {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setQuoteState("error");
      });
    return undefined;
  }, [listingId, startDate, endDate, quantity]);

  return { quote, quoteState };
}
