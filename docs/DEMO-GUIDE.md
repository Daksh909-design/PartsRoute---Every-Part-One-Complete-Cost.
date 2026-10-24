# Demo walkthrough

## Sample calculation

Open the public sample. It starts with two HC-SR04 sensors, one DHT11 module and one breadboard, delivered to pincode 560001.

The synthetic example shows why item prices alone are misleading:

| Plan                                            | Items | Shipping | Total |
| ----------------------------------------------- | ----: | -------: | ----: |
| Lowest item prices, split between two retailers |  ₹225 |     ₹120 |  ₹345 |
| Best complete sample basket                     |  ₹255 |      ₹40 |  ₹295 |

Change the HC-SR04 quantity from two to three and calculate again. The best sample total becomes ₹370. Reset restores the original basket. Expand the other combinations to inspect their costs and the matching details to see the required specifications.

These numbers come from synthetic fixtures. They are not current retailer prices.

## Live collection

On a configured server, choose **Live quote**, enter the team token and check the connection. Select **Collect & compare fresh offers** to start new TinyFish and model requests.

The result shows priced-line coverage, product differences and missing costs. **Evidence** contains source URLs, retrieval times, original observations, provider request IDs and saved Agent runs. **View saved observations** is a separate read-only option and does not make new provider calls.

A complete live demonstration needs matching products, published order constraints and verified shipping for the exact basket and pincode. If a fact is missing, the result remains partial. The latest recorded live run has no complete verified total; see [validation](VALIDATION.md).

## Links

- [Sample calculator](https://daksh909-design.github.io/PartsRoute---Every-Part-One-Complete-Cost./)
- [Source code](https://github.com/Daksh909-design/PartsRoute---Every-Part-One-Complete-Cost./)
- [Local setup](LIVE-SETUP.md)
- [Recorded collection timings](PERFORMANCE.md)

A demo recording and presentation link have not been added.
