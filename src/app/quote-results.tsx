import type { Plan, QuoteResult } from "../domain/schema";
import { retailers } from "../domain/catalogue";
import { money, when } from "./api-client";
import {
  itemFirstComparison,
  itemsAndShippingEstimate,
} from "../domain/comparison";
import { collectionIssues } from "../domain/issues";
import { listedEstimate } from "../domain/listed-estimate";

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
          Items: {money(plan.knownSubtotalPaise)} · Delivered total pending
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
                  {line.quantityUnit === "packs" ? (
                    <>
                      {line.packs} retailer packs · requested{" "}
                      {line.requiredUnits} packs
                    </>
                  ) : (
                    <>
                      {line.packs} × {line.offer.unitsPerPack}-unit pack · need{" "}
                      {line.requiredUnits}, receive {line.purchasedUnits}
                    </>
                  )}
                </small>
              </div>
              <strong>{money(line.payablePaise)}</strong>
            </div>
          ))}
          {!demo && (
            <p className="source-note">
              {basket.shipping.status === "estimated" &&
                basket.shipping.chargePaise !== null && (
                  <>
                    Estimated shipping, before tax:{" "}
                    {money(basket.shipping.chargePaise)}.{" "}
                  </>
                )}
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
  const comparison = itemFirstComparison(result.plans, result.recommendedId);
  const deliveredEstimate =
    !demo && best && !best.verified ? itemsAndShippingEstimate(best) : null;
  const estimate =
    !demo && !best ? listedEstimate(result.input.parts, result.offers) : null;
  return (
    <div className="quote-results">
      {result.dataStatus && (
        <div className="observation-age">
          <strong>Saved prices</strong>
          <span>Last checked {when(result.dataStatus.oldestObservedAt)}</span>
          {result.dataStatus.missingUrls > 0 && (
            <span>
              {result.dataStatus.missingUrls} product page
              {result.dataStatus.missingUrls === 1 ? " is" : "s are"} missing a
              recent usable observation.
            </span>
          )}
        </div>
      )}
      {stale && (
        <p className="notice warning" role="status">
          Your inputs have changed. Recalculate before using these results.
        </p>
      )}
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {demo ? "SAMPLE COMPARISON" : "CHECKED PURCHASING PLANS"}
          </span>
          <h2>
            {demo
              ? "Order comparison"
              : recommendation
                ? "Best checked plan"
                : "Your comparison"}
          </h2>
        </div>
      </div>
      <p className="muted">
        {result.coverage.covered}/{result.coverage.requested}{" "}
        {demo ? "lines covered" : "purchase-ready lines"} ·{" "}
        {result.plans.length} combinations checked ·{" "}
        {result.plans.filter((plan) => plan.verified).length}{" "}
        {demo ? "complete sample plans" : "verified plans"}
      </p>
      {result.comparisonLimited && (
        <p className="notice warning">
          Large basket: comparing shortlisted combinations.
        </p>
      )}

      {estimate && (
        <article className="recommendation" style={{ padding: "1.5rem" }}>
          <span className="eyebrow">
            {estimate.complete
              ? "LISTED ITEM ESTIMATE"
              : "PARTIAL ITEM ESTIMATE"}
          </span>
          <p className="quote-total">
            {money(estimate.itemTotalPaise ?? estimate.itemsPaise)}
          </p>
          <p>
            {estimate.pricedLines} of {estimate.requestedLines} component lines
            priced
            {estimate.itemTotalPaise === null
              ? " · Additional tax unknown"
              : " · Includes known item tax"}
          </p>
          <dl className="costs">
            <div>
              <dt>Listed items</dt>
              <dd>{money(estimate.itemsPaise)}</dd>
            </div>
            <div>
              <dt>Additional item tax</dt>
              <dd>{money(estimate.addedTaxPaise)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>Not verified</dd>
            </div>
            <div className="sum">
              <dt>Delivered total</dt>
              <dd>Unavailable</dd>
            </div>
          </dl>
          <p className="notice warning">
            Excludes shipping
            {!estimate.complete && " and unpriced components"}.{" "}
            {estimate.conditional && "Some order details are pending."}
          </p>
          {estimate.lines.map((line) => (
            <div className="purchase-line" key={line.partId}>
              <div>
                <a href={line.offer.url} target="_blank" rel="noreferrer">
                  {line.name} ↗
                </a>
                <small>
                  {retailers[line.offer.retailer].name} · {line.packs} ×{" "}
                  {line.offer.unitsPerPack}-unit pack · need {line.quantity}
                </small>
                {line.assumptions.map((assumption) => (
                  <small key={assumption}>{assumption}</small>
                ))}
              </div>
              <strong>
                {money(line.listedPayablePaise ?? line.itemsPaise)}
              </strong>
            </div>
          ))}
        </article>
      )}
      {!demo && result.offers.length > 0 && (
        <section className="listed-offers" aria-label="Observed product prices">
          <h3>Listed prices</h3>
          <p className="source-note">
            Per pack · Excludes additional tax and shipping
          </p>
          {result.offers.map((offer) => (
            <div className="offer-row" key={offer.id}>
              <div>
                <a href={offer.url} target="_blank" rel="noreferrer">
                  {offer.title.replace(/^\[Synthetic\]\s*/, "")}
                </a>
                <small>
                  {retailers[offer.retailer].name} ·{" "}
                  {offer.unitsPerPack ?? "Unknown"} unit
                  {offer.unitsPerPack === 1 ? "" : "s"} / pack ·{" "}
                  {offer.stock.replaceAll("_", " ")}
                </small>
              </div>
              <strong>
                {offer.priceBreaks[0]
                  ? money(offer.priceBreaks[0].packPricePaise)
                  : "Unknown"}
              </strong>
            </div>
          ))}
        </section>
      )}
      {best ? (
        <article className="recommendation">
          <div className="recommendation-heading">
            <div>
              <span className="eyebrow">
                {demo
                  ? "LOWEST COMPLETE SAMPLE"
                  : best.verified
                    ? "DELIVERED TOTAL"
                    : deliveredEstimate
                      ? "ITEMS + SHIPPING ESTIMATE"
                      : "KNOWN ITEM SUBTOTAL"}
              </span>
              <p className="quote-total">
                {best.verified
                  ? money(best.totalPaise)
                  : money(
                      deliveredEstimate?.amountPaise ?? best.knownSubtotalPaise,
                    )}
              </p>
              {deliveredEstimate && (
                <p className="muted">
                  {deliveredEstimate.shippingTaxUnknown
                    ? "Shipping tax pending"
                    : "Estimated shipping"}
                </p>
              )}
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
          <p>Check product details below.</p>
        </div>
      )}
      {comparison && (
        <section
          className="strategy-comparison"
          aria-label="Item prices versus complete basket cost"
        >
          <div className="strategy-heading">
            <h3>Split order vs. complete basket</h3>
            <span>{demo ? "Sample arithmetic" : "Verified totals"}</span>
          </div>
          <div className="strategy-row">
            <span>
              Buy each part at its lowest item cost
              <small>
                {money(
                  comparison.baseline.itemsPaise +
                    comparison.baseline.addedTaxPaise!,
                )}{" "}
                items + {money(comparison.baseline.shippingPaise)} shipping ·{" "}
                {comparison.baseline.baskets.length} retailers
              </small>
            </span>
            <strong>{money(comparison.baseline.totalPaise)}</strong>
          </div>
          <div className="strategy-row strategy-winner">
            <span>
              Use the best complete basket
              <small>
                {money(
                  comparison.recommendation.itemsPaise +
                    comparison.recommendation.addedTaxPaise!,
                )}{" "}
                items + {money(comparison.recommendation.shippingPaise)}{" "}
                shipping · {comparison.recommendation.baskets.length} retailer
                {comparison.recommendation.baskets.length === 1 ? "" : "s"}
              </small>
            </span>
            <strong>{money(comparison.recommendation.totalPaise)}</strong>
          </div>
          <p>
            {money(comparison.savingPaise)} lower overall, even though the items
            cost more.
          </p>
        </section>
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
                      ? "Sample data"
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
        <section className="collection-summary" aria-label="Incomplete checks">
          <h3>Still to check</h3>
          {collectionIssues(result.errors).map((group) => (
            <div className="issue-group" key={group.title}>
              <strong>{group.title}</strong>
              <p>{group.action}</p>
              <details>
                <summary>Details ({group.details.length})</summary>
                <ul className="issues">
                  {group.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </section>
      )}
      <div className="result-footer">
        <button type="button" className="text-button" onClick={inspect}>
          View collection evidence ↗
        </button>
        <span className="muted">
          {demo ? "Sample data" : `Assembled ${when(result.generatedAt)}`}
        </span>
      </div>
      {!demo && <p className="source-note">{result.explanation}</p>}
    </div>
  );
}
