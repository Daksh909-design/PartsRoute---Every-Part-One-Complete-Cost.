# Live component discovery

Live mode starts with an empty parts list. Search by component name, specification or part number, select an actual listing and its published variant, then add it. There is no three-line limit. The original three products are sample fixtures and an optional explicit starter list.

Robocraze search uses its public product suggestions and product JSON endpoints. Search results preserve retailer ranking and expose published prices, stock and variants. Robu search collects actual product links through TinyFish; a blocked retailer produces an explicit error rather than substitute products. Each search stores original responses, source URLs and its observation time in PostgreSQL. Up to ten suggestions per retailer are shown per search; refine the query to find another product. This is a search-page limit, not a parts-list limit.

Selected product URLs and variant IDs bind matching and shipping to the chosen products. Search does not infer that differently named listings from different stores are interchangeable. Optional model and specification constraints still reject conflicts. Quantities default to retailer packs, so an unknown physical pack size is never invented. Switching to physical units requires published pack-size evidence.

The API accepts parts lists within a 128 KiB request budget and quantities of 1–100 per row. Collection uses provider batches of at most ten URLs and a collection window that scales with list size. Larger comparisons retain a bounded shortlist plus complete single-store candidates; the UI explicitly labels comparisons that are not exhaustive. These resource limits do not promise every possible retailer allocation will be enumerated.

Validation: 145 automated tests passed, the isolated production build and static sample build passed, three real search queries each returned ten actual Robocraze listings, and a four-component collection established all four product offers. Shipping tax remained unknown; an estimated shipping charge is not a verified delivered total.

The public production endpoint also accepted a fresh four-line quote at pincode 110034 and returned exact matches for all four lines in 26.581 seconds (partial overall: shipping tax was still unknown). The public HTTP smoke suite passed all nine checks. Browser interaction verification for this update remains blocked by the desktop browser setting.
