import type { Plan, QuoteResult } from "../domain/schema";
import { retailers } from "../domain/catalogue";
import { money, when } from "./api-client";

export function BasketPlan({ plan, demo }: { plan: Plan; demo: boolean }) {
  return (
    <div className="basket-plan">
      <dl className="costs">
        <div>
          <dt>Items, as listed</dt>
          <dd>{money(plan.itemsPaise)}</dd>
        </div>
        <div>
          <dt>Additional item tax</dt>
          <dd>{money(plan.addedTaxPaise)}</dd>
        </div>
        <div>
          <dt>Shipping, including shipping tax</dt>
          <dd>{money(plan.shippingPaise)}</dd>
        </div>
        <div className="sum">
          <dt>{plan.verified ? "Total payable" : "Unverified total"}</dt>
          <dd>{money(plan.totalPaise)}</dd>
        </div>
      </dl>
      {!plan.verified && (
        <p className="notice warning">
          Known item subtotal: {money(plan.knownSubtotalPaise)}. A complete
          landed cost is not verified.
        </p>
      )}
      {plan.baskets.map((basket) => (
        <section className="store-basket" key={basket.key}>
          <div className="store-heading">
            <h3>{retailers[basket.retailer].name}</h3>
            <span className="muted">
              {demo ? "Sample shipping" : `Shipping ${basket.shipping.status}`}
            </span>
          </div>
          {basket.lines.map((line) => (
            <div className="purchase-line" key={line.offer.id}>
              <div>
                <a href={line.offer.url} target="_blank" rel="noreferrer">
                  {line.offer.title.replace(/^\[Synthetic\]\s*/, "")} ↗
                </a>
                <small>
                  {line.packs} × {line.offer.unitsPerPack}-unit pack · need{" "}
                  {line.requiredUnits}, receive {line.purchasedUnits}
                </small>
              </div>
              <strong>{money(line.payablePaise)}</strong>
            </div>
          ))}
          {!demo && (
            <p className="source-note">
              {basket.shipping.conditions} · {when(basket.shipping.observedAt)}
            </p>
          )}
        </section>
      ))}
      {plan.unresolved.length > 0 && (
        <ul className="issues">
          {plan.unresolved.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QuoteResults({
  result,
  stale,
  inspect,
  confirm,
}: {
  result: QuoteResult;
  stale: boolean;
  inspect: () => void;
  confirm: (partId: string, offerId: string) => void;
}) {
  const demo = result.mode === "demo";
  const recommendation = result.plans.find(
    (plan) => plan.id === result.recommendedId,
  );
  const best = recommendation || result.plans[0];
  const alternatives = result.plans.filter((plan) => plan.id !== best?.id);
  const next =
    recommendation &&
    alternatives.find((plan) => plan.verified && plan.totalPaise !== null);
  const saving =
    next &&
    recommendation?.totalPaise !== null &&
    recommendation?.totalPaise !== undefined
      ? next.totalPaise! - recommendation.totalPaise
      : 0;
  return (
    <div className="quote-results">
      {stale && (
        <p className="notice warning" role="status">
          Your inputs have changed. Recalculate before using these results.
        </p>
      )}
      <div className="section-heading">
        <div>
          <span className="overline">
            {demo ? "SAMPLE COMPARISON" : "CHECKED PURCHASING PLANS"}
          </span>
          <h2>
            {demo
              ? "Your sample purchasing plan"
              : recommendation
                ? "Best verified plan among checked options"
                : "No complete verified plan yet"}
          </h2>
        </div>
      </div>
      <p className="muted">
        {result.coverage.covered}/{result.coverage.requested} lines covered ·{" "}
        {result.plans.length} combinations checked ·{" "}
        {result.plans.filter((plan) => plan.verified).length}{" "}
        {demo ? "complete sample plans" : "verified plans"}
      </p>
      {demo && (
        <p className="sample-disclosure">
          Invented prices and shipping, calculated from your inputs. These are
          not current retailer offers.
        </p>
      )}
      {best ? (
        <article className="recommendation">
          <div className="recommendation-heading">
            <div>
              <span className="overline">
                {demo
                  ? "LOWEST COMPLETE SAMPLE"
                  : best.verified
                    ? "VERIFIED LANDED COST"
                    : "INCOMPLETE ALTERNATIVE"}
              </span>
              <p className="quote-total">
                {best.verified
                  ? money(best.totalPaise)
                  : "Shipping not verified"}
              </p>
            </div>
            <span className="retailer-count">
              {best.baskets.length} retailer
              {best.baskets.length !== 1 ? "s" : ""}
            </span>
          </div>
          {saving > 0 && (
            <p className="comparison-note">
              {money(saving)} below the next complete{" "}
              {demo ? "sample" : "verified"} plan.
            </p>
          )}
          <BasketPlan plan={best} demo={demo} />
        </article>
      ) : (
        <div className="empty-panel">
          <h3>Some parts have no eligible offer.</h3>
          <p>
            Review the product matches below. A price alone is not enough when
            specifications, stock or pack details are missing.
          </p>
        </div>
      )}
      {alternatives.length > 0 && (
        <section className="alternatives">
          <h3>
            Other checked combinations{" "}
            <span className="muted">({alternatives.length})</span>
          </h3>
          {alternatives.map((plan) => (
            <details key={plan.id}>
              <summary>
                <span>
                  {plan.baskets
                    .map((basket) => retailers[basket.retailer].name)
                    .join(" + ")}
                </span>
                <span className="alternative-price">
                  {plan.verified ? money(plan.totalPaise) : "Unverified"}
                </span>
              </summary>
              <BasketPlan plan={plan} demo={demo} />
            </details>
          ))}
        </section>
      )}
      <section className="matches">
        <h3>
          {demo
            ? "Sample matches & source fields"
            : "Product matches & sources"}
        </h3>
        {demo && (
          <p className="source-note">
            These matches describe synthetic fixture records, not verified
            retailer products.
          </p>
        )}
        {result.offers.length === 0 && (
          <p className="muted">No usable product observation was returned.</p>
        )}
        {result.offers.map((offer) => (
          <details key={offer.id}>
            <summary>
              <span>
                {retailers[offer.retailer].name} ·{" "}
                {offer.title.replace(/^\[Synthetic\]\s*/, "")}
              </span>
              <span className={`match-status ${offer.match}`}>
                {offer.match.replaceAll("_", " ")}
              </span>
            </summary>
            <div className="match-details">
              <a href={offer.url} target="_blank" rel="noreferrer">
                Open product page ↗
              </a>
              <p>
                SKU {offer.sku || "not published"} · Stock:{" "}
                {offer.stock.replaceAll("_", " ")}
              </p>
              {offer.reasons.map((reason, index) => (
                <p key={index}>{reason}</p>
              ))}
              <dl className="spec-list">
                {offer.specs.map((spec, index) => (
                  <div key={index}>
                    <dt>{spec.key.replaceAll("_", " ")}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
              {offer.match === "needs_confirmation" && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => confirm(offer.partId, offer.id)}
                >
                  Confirm this equivalent, then recalculate
                </button>
              )}
              {offer.evidence.map((source) => (
                <div className="source" key={source.id}>
                  <p>
                    {source.method === "synthetic-fixture"
                      ? "Synthetic fixture"
                      : source.method}{" "}
                    · {when(source.retrievedAt)}
                  </p>
                  <blockquote>{source.excerpt}</blockquote>
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>
      {result.errors.length > 0 && (
        <details className="collection-errors">
          <summary>
            {result.errors.length} collection issue
            {result.errors.length !== 1 ? "s" : ""}
          </summary>
          <ul className="issues">
            {result.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="result-footer">
        <button type="button" className="text-button" onClick={inspect}>
          View collection evidence ↗
        </button>
        <span className="muted">
          {demo
            ? "Synthetic fixture · 1 Jan 2026"
            : `Assembled ${when(result.generatedAt)}`}
        </span>
      </div>
      {!demo && (
        <p className="source-note">
          {result.explanation} Prices can change. Open the retailer pages to
          review before buying.
        </p>
      )}
    </div>
  );
}
