import delay from 'delay';
import { of } from "rxjs";
import { take, map, combineLatest } from "rxjs/operators";

import { marbles } from "rxjs-marbles/jest";

import { makeExecutableSchema } from "graphql-tools";

import { graphql } from "../";

const typeDefs = `
  type Shuttle {
    name: String!
    firstFlight: Int
  }

  type Query {
    launched(name: String): [Shuttle!]!
  }

  type Mutation {
    createShuttle(name: String): Shuttle!
    createShuttleList(name: String): [Shuttle!]!
  }
`;

const mockResolvers = {
  Query: {
    launched: (parent, args, ctx) => {
      const { name } = args;

      // act according with the type of filter
      if (name === undefined) {
        // When no filter is passed
        if (!parent) {
          return ctx.query;
        }

        return ctx.query.pipe(
          map((shuttles: any[]) =>
            shuttles.map(shuttle => ({
              ...shuttle,
              name: shuttle.name + parent.shuttleSuffix
            }))
          )
        );
      } else if (typeof name === "string") {
        // When the filter is a value
        return ctx.query.pipe(
          map(els => (els as any[]).filter(el => el.name === name))
        );
      } else {
        // when the filter is an observable
        return ctx.query.pipe(
          combineLatest(name, (res, name) => [res, name]),
          map(els => els[0].filter(el => el.name === els[1]))
        );
      }
    }
  },
  Mutation: {
    createShuttle: (_, args, ctx) => {
      return ctx.mutation.pipe(
        map(() => ({
          name: args.name
        }))
      );
    },
    createShuttleList: (_, args, ctx) => {
      return ctx.mutation.pipe(
        map(() => [
          { name: "discovery" },
          { name: "challenger" },
          { name: args.name }
        ])
      );
    }
  }
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: mockResolvers
});

const fieldResolverSchema = makeExecutableSchema({
  typeDefs: `
    type Plain {
      noFieldResolver: String!
      fieldResolver: String!
      fieldResolvesUndefined: String!
      giveMeTheParentFieldResolver: String!
      giveMeTheArgsFieldResolver(arg: String!): String!
      giveMeTheContextFieldResolver: String!
    }

    type ObjectValue {
      value: String!
    }

    type Item {
      nodeFieldResolver: ObjectValue!
      nullableNodeFieldResolver: ObjectValue
      giveMeTheParentFieldResolver: ObjectValue!
      giveMeTheArgsFieldResolver(arg: String!): ObjectValue!
      giveMeTheContextFieldResolver: ObjectValue!
    }

    type Nested {
      firstFieldResolver: Nesting!
    }

    type Nesting {
      noFieldResolverValue: String!
      secondFieldResolver: String!
    }

    type Query {
      plain: Plain!
      item: Item!
      nested: Nested!
      throwingResolver: String
    }
  `,
  resolvers: {
    Plain: {
      fieldResolver() {
        return of("I am a field resolver");
      },
      fieldResolvesUndefined() {
        return of(undefined);
      },
      giveMeTheParentFieldResolver(parent) {
        return of(JSON.stringify(parent));
      },
      giveMeTheArgsFieldResolver(_parent, args) {
        return of(JSON.stringify(args));
      },
      giveMeTheContextFieldResolver(_parent, _args, context) {
        return of(context.newValue);
      }
    },
    Item: {
      nodeFieldResolver() {
        return of({ value: "I am a node field resolver" });
      },
      nullableNodeFieldResolver() {
        return null;
      },
      giveMeTheParentFieldResolver(parent) {
        return of({ value: JSON.stringify(parent) });
      },
      giveMeTheArgsFieldResolver(_parent, args) {
        return of({ value: JSON.stringify(args) });
      },
      giveMeTheContextFieldResolver(_parent, _args, context) {
        return of({ value: context.newValue });
      }
    },
    Nested: {
      firstFieldResolver(_parent, _args, ctx) {
        ctx.contextValue = " resolvers are great";

        return of({ noFieldResolverValue: "nested" });
      }
    },
    Nesting: {
      secondFieldResolver({ noFieldResolverValue }, _, { contextValue }) {
        return of(noFieldResolverValue.toLocaleUpperCase() + contextValue);
      }
    },
    Query: {
      plain(_parent, _args, ctx) {
        ctx.newValue = "ContextValue";

        return of({
          noFieldResolver: "Yes"
        });
      },
      item(_parent, _args, ctx) {
        ctx.newValue = "NodeContextValue";

        return of({ thisIsANodeFieldResolver: "Yes" });
      },

      nested() {
        return of({});
      },
      throwingResolver() {
        throw new Error("my personal error");
      }
    }
  }
});

// jest helper who binds the marbles for you
const itMarbles = (title, test) => {
  return it(title, marbles(test));
};

itMarbles.only = (title, test) => {
  return it.only(title, marbles(test));
};

describe("graphqlObservable", function() {
  describe("Query", function() {
    itMarbles("solves listing all fields", function(m) {
      const query = `
        query {
          launched {
            name
          }
        }
      `;

      const expectedData = [{ name: "discovery" }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: expectedData } }
      });

      const result = graphql(schema, query, null, { query: dataSource });

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("solves listing all fields with string query", function(m) {
      const query = `
        query {
          launched {
            name
          }
        }
      `;

      const expectedData = [{ name: "discovery" }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: expectedData } }
      });

      const result = graphql(schema, query, null, { query: dataSource });

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("filters by variable argument", function(m) {
      const query = `
        query($nameFilter: String) {
          launched(name: $nameFilter) {
            name
            firstFlight
          }
        }
      `;

      const expectedData = [{ name: "apollo11", firstFlight: null }, { name: "challenger", firstFlight: null }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: [expectedData[0]] } }
      });

      const nameFilter = "apollo11";
      const result = graphql(
        schema,
        query,
        null,
        {
          query: dataSource
        },
        {
          nameFilter
        }
      );

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("filters by static argument", function(m) {
      const query = `
        query {
          launched(name: "apollo13") {
            name
            firstFlight
          }
        }
      `;

      const expectedData = [{ name: "apollo13", firstFlight: null }, { name: "challenger", firstFlight: null }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: [expectedData[0]] } }
      });

      const result = graphql(schema, query, null, {
        query: dataSource
      });

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("filters out fields", function(m) {
      const query = `
        query {
          launched {
            name
          }
        }
      `;

      const expectedData = [{ name: "discovery", firstFlight: 1984 }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: [{ name: "discovery" }] } }
      });

      const result = graphql(schema, query, null, {
        query: dataSource
      });

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("resolve with name alias", function(m) {
      const query = `
        query {
          launched {
            title: name
          }
        }
      `;

      const expectedData = [{ name: "challenger", firstFlight: 1984 }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: [{ title: "challenger" }] } }
      });

      const result = graphql(schema, query, null, {
        query: dataSource
      });

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    itMarbles("resolves using root value", function(m) {
      const query = `
        query {
          launched {
            name
          }
        }
      `;

      const expectedData = [{ name: "challenger", firstFlight: 1984 }];
      const dataSource = of(expectedData);
      const expected = m.cold("(a|)", {
        a: { data: { launched: [{ name: "challenger-nasa" }] } }
      });

      const result = graphql(
        schema,
        query,
        {
          shuttleSuffix: "-nasa"
        },
        {
          query: dataSource
        }
      );

      m.expect(result.pipe(take(1))).toBeObservable(expected);
    });

    describe("Field Resolvers", function() {
      describe("Leafs", function() {
        itMarbles("defaults to return the property on the object", function(m) {
          const query = `
            query {
              plain {
                noFieldResolver
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: { data: { plain: { noFieldResolver: "Yes" } } }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("if defined it executes the field resolver", function(m) {
          const query = `
            query {
              plain {
                fieldResolver
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: { data: { plain: { fieldResolver: "I am a field resolver" } } }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("if defined but returns undefined, field is null", function (m) {
          const query = `
            query {
              plain {
                fieldResolvesUndefined
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: { data: { plain: { fieldResolvesUndefined: null } } }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 1st argument is parent", function(m) {
          const query = `
            query {
              plain {
                giveMeTheParentFieldResolver
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                plain: {
                  giveMeTheParentFieldResolver: JSON.stringify({
                    noFieldResolver: "Yes"
                  })
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 2nd argument is arguments", function(m) {
          const query = `
            query {
              plain {
                giveMeTheArgsFieldResolver(arg: "My passed arg")
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                plain: {
                  giveMeTheArgsFieldResolver: JSON.stringify({
                    arg: "My passed arg"
                  })
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 3rd argument is context", function(m) {
          const query = `
            query {
              plain {
                giveMeTheContextFieldResolver
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                plain: {
                  giveMeTheContextFieldResolver: "ContextValue"
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });
      });

      describe("Nodes", function() {
        itMarbles("if defined it executes the field resolver", function(m) {
          const query = `
            query {
              item {
                nodeFieldResolver {
                  value
                }
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                item: {
                  nodeFieldResolver: { value: "I am a node field resolver" }
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("if nullable field resolver returns null, it resolves null", function(m) {
          const query = `
            query {
              item {
                nullableNodeFieldResolver {
                  value
                }
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                item: {
                  nullableNodeFieldResolver: null
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 1st argument is parent", function(m) {
          const query = `
            query {
              item {
                giveMeTheParentFieldResolver {
                  value
                }
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                item: {
                  giveMeTheParentFieldResolver: {
                    value: JSON.stringify({
                      thisIsANodeFieldResolver: "Yes"
                    })
                  }
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 2nd argument is arguments", function(m) {
          const query = `
            query {
              item {
                giveMeTheArgsFieldResolver(arg: "My passed arg") {
                  value
                }
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                item: {
                  giveMeTheArgsFieldResolver: {
                    value: JSON.stringify({
                      arg: "My passed arg"
                    })
                  }
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });

        itMarbles("the field resolvers 3rd argument is context", function(m) {
          const query = `
            query {
              item {
                giveMeTheContextFieldResolver {
                  value
                }
              }
            }
          `;
          const expected = m.cold("(a|)", {
            a: {
              data: {
                item: {
                  giveMeTheContextFieldResolver: { value: "NodeContextValue" }
                }
              }
            }
          });
          const result = graphql(fieldResolverSchema, query, null, {});
          m.expect(result.pipe(take(1))).toBeObservable(expected);
        });
      });

      itMarbles("nested resolvers pass down the context and parent", function(
        m
      ) {
        const query = `
          query {
            nested {
              firstFieldResolver {
                noFieldResolverValue
                secondFieldResolver
              }
            }
          }
        `;
        const expected = m.cold("(a|)", {
          a: {
            data: {
              nested: {
                firstFieldResolver: {
                  noFieldResolverValue: "nested",
                  secondFieldResolver: "NESTED resolvers are great"
                }
              }
            }
          }
        });
        const result = graphql(fieldResolverSchema, query, null, {});
        m.expect(result.pipe(take(1))).toBeObservable(expected);
      });
    });

    it("throwing an error results in an error in execution result", async function() {
      const query = `
        query {
          throwingResolver
        }
      `;

      const result = await graphql(fieldResolverSchema, query, null, {}).pipe(take(1)).toPromise();
      expect(result).toHaveProperty('errors');
      expect(result.errors![0].message).toBe('my personal error');
      expect(result.errors![0].path).toEqual(['throwingResolver']);

    });

    it(
      "accessing an unknown query field results in an error in execution result",
      async function() {
        const query = `
          query {
            youDontKnowMe
          }
        `;
        const result = await graphql(fieldResolverSchema, query, null, {}).pipe(take(1)).toPromise();
        expect(result).toHaveProperty('errors');
        expect(result.errors![0].message).toBe('Cannot query field \"youDontKnowMe\" on type \"Query\".')
      }
    );
  });

  describe("Mutation", function() {
    itMarbles("createShuttle adds a shuttle and return its name", function(m) {
      const mutation = `
        mutation {
          createShuttle(name: "RocketShip") {
            name
          }
        }
      `;

      const fakeRequest = { name: "RocketShip" };
      const commandContext = of(fakeRequest);

      const result = graphql(schema, mutation, null, {
        mutation: commandContext
      });

      const expected = m.cold("(a|)", {
        a: { data: { createShuttle: { name: "RocketShip" } } }
      });

      m.expect(result).toBeObservable(expected);
    });

    itMarbles(
      "createShuttleList adds a shuttle and return all shuttles",
      function(m) {
        const mutation = `
          mutation {
            createShuttleList(name: "RocketShip") {
              name
            }
          }
        `;

        const commandContext = of("a request");

        const result = graphql(schema, mutation, null, {
          mutation: commandContext
        });

        const expected = m.cold("(a|)", {
          a: {
            data: {
              createShuttleList: [
                { name: "discovery" },
                { name: "challenger" },
                { name: "RocketShip" }
              ]
            }
          }
        });

        m.expect(result).toBeObservable(expected);
      }
    );

    itMarbles("accept alias name", function(m) {
      const mutation = `
        mutation ($name: String){
          shut: createShuttle(name: $name) {
            name
          }
        }
      `;

      const commandContext = of("a resquest");
      const variables = {
        name: "RocketShip"
      };
      const result = graphql(
        schema,
        mutation,
        null,
        {
          mutation: commandContext
        },
        variables
      );

      const expected = m.cold("(a|)", {
        a: { data: { shut: { name: "RocketShip" } } }
      });

      m.expect(result).toBeObservable(expected);
    });

    it('respects serial execution of resolvers', async () => {
      let theNumber = 0;
      const schema = makeExecutableSchema({
        typeDefs: `
        type Mutation {
          increment: Int!
        }
        type Query {
          theNumber: Int!
        }
      `,
      resolvers: {
          Mutation: {
            // atomic resolver
            increment: async () => {
              const _theNumber = theNumber;
              await delay(100);
              theNumber = _theNumber + 1;
              return theNumber;
            }
          },
        }
      });

      const result$ = graphql({
        schema,
        source: `
        mutation {
          first: increment,
          second: increment,
          third: increment,
        }
        `,
      })
      const result = await result$.pipe(take(1)).toPromise();
      expect(result).toEqual({
        data: {
          first: 1,
          second: 2, // 1 if not serial
          third: 3, // 1 if not serial
        }
      })
    })
  });
});
