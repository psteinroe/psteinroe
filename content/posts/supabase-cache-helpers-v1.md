---
title: Announcing Supabase Cache Helpers 1.0
date: 2023-04-25
draft: false
description: SWR and React Query Wrappers for Supabase
author: psteinroe
---

[Supabase Cache Helpers](https://supabase-cache-helpers.vercel.app) is a collection of framework specific cache utilities for working with [Supabase](https://supabase.com). It bridges the gap between data-fetching libraries such as [SWR](https://swr.vercel.app) and [React Query](https://tanstack.com/query/v3/docs/react/overview), and the Supabase client libraries.

## Motivation

Supabase offers a bunch of SDKs to interact with their services, such as the Postgres database, Realtime and Storage. Depending on your requirements, these might be sufficient to build your application. At some point however, you will want to use data-fetching libraries such as SWR and React Query to reduce boilerplate, cache data, dedupe requests, and much more. When starting to use these libraries, you might find that its quite straightforward to fetch data from Supabase: define a cache key, write a simple fetcher functions and off you go. Here is an example of a simple hook that fetches a `note` by id using a SWR hook:

```tsx
// fetcher function to get contact by id
export function getContactById(client: SupabaseClient, contactId: string) {
  return client
    .from('contact')
    .select(`id,username,ticket_number`)
    .eq('id', contactId)
    .throwOnError()
    .single()
}

// wrapper hook
function useContactQuery(contactId: string) {
  const client = useSupabaseClient()
  // cache key for this query
  const key = ['contact', contactId]

  return useSWR(key, async () => {
    return getContactById(client, contactId).then((result) => result.data)
  })
}

export default useContactQuery
```

Easy enough. Now import the hook into your component and display the contact.

```tsx
function ContactCard({ contactId }: { contactId: string }) {
  const { data: contact, isLoading, isError } = useContactQuery(contactId)

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (isError) {
    return <div>Error</div>
  }

  return (
    <div>
      <h1>{contact.username}</h1>
    </div>
  )
}
```

But its a lot of boilerplate, right? And as a developer, you have little transparency on the actual query being executed when looking at the `ContactNote` component. In our organisation, we found this intransparency to be the source of performance issues and bugs, because people tend to avoid writing a new hook, and just overload that one query with all the columns, filters and joins they need. This becomes worse when the size and complexity of your app grows. Imagine a complex table view, that allows the user to apply a bunch of filters and ordering. For proper caching, you will need to pass filter object into your hook, and encode the query settings into the key. The maintainability will decrease to zero at some point.

The same is true for mutations. It is simple at first. Just define your fetcher, and pass it to the `useMutation` hook:

```tsx
// fetcher function to update a note by id
export async function updateContact(
  client: SupabaseClient,
  id: string,
  data: Partial<Contact>
) {
  return client
    .from('contact')
    .update(data)
    .eq('id', id)
    .throwOnError()
    .select('id,username')
    .throwOnError()
    .single()
}

// wrapper hook
function useUpdateContactMutation() {
  const client = useSupabase()

  return useMutation(async (contact: Contact) => {
    return updateContactById(client, note).then((result) => result.data)
  })
}
```

Easy. When updating the username of the contact, you might want the change to be reflected both in the `ContactCard` component, as well as in the table view. Oversimplified, such cache update code might look like this:

```tsx
{
  onSuccess: (updatedContact) => {
    // update query that selects a single contact by id
    mutate(['contact', updatedContact.id], (existingContact) => {
      return {
        ...existingContact,
        ...updatedContact,
      }
    })

    // you might have a contact list query somewhere, too.
    mutate(['contacts', 'filters=has_golden_ticket.is.true'], (data) => {
      if (data) {
        return data.map((contact) => {
          if (updatedContact.id === contact.id) {
            return { ...contact, ...updatedContact }
          }

          return contact
        })
      }
    })
  }
}
```

This is a very simple example, and does not nearly cover all required edge cases. For example, what if the table query is filtered or ordered on the username of the contact? You will need to write a lot of repetitive code, just to keep your apps cache up-to-date. But what if we could implement a generalizable solution?

With Supabase Cache Helpers, you can archieve all of the above and more with just a single line of code.

## Encoding Queries

The `useContactQuery` hook can be simplified to:

```tsx
const { data, error } = useQuery(
  client
    .from('contact')
    .select(`id,username,ticket_number`)
    .eq('id', contactId)
    .single()
)
```

Thats it. Supabase Cache Helpers will encode the client object into a definite cache key, and pass it to a generic fetcher function that makes the request. The key itself will contain all important information about the query:

- schema and table name
- selected columns
- applied filters
- body of the request (for encoding `.rpc()` queries)
- count settings
- whether it is a head query
- what ordering is applied

For the (simple) query above, the query key in SWR is:

```ts
;[
  'postgrest', // key prefix
  'null', // for swr, this is set to a constant if its an infinite query
  'public', // schema
  'contact', // table
  'select=id%2Cusername%2Cticket_number&username=eq.psteinroe', // sorted search params including selected columns and filters
  'null', // body (for encoding `.rpc()` queries)
  'count=exact', // count settings
  'head=false', // whether it is a head query
  '', // no ordering
]
```

This key contains all information of the query it belongs to, and will help us to automatically populate the cache after mutations, or when subscription data is arriving. All information is extracted from the `PostgrestClient` instance. Internally, the client simply sets a few protected properties, and builds an `URL` object. Luckily, only TypeScript knows what a protected property is, so we can access them via `client['url']` and extract the query details. For pagination and infinite scroll query keys, the encoding works the same.

## Mutating Data

Similar to queries, we can replace the mutation fetcher and hook with a one-liner:

```tsx
const { trigger } = useUpsertMutation(
  client.from('contact'),
  ['id'], // primary keys of `contact`
  'id,username' // will be passed to .select(`id,username`)
)
```

To auto-populate the data the same way the custom code above does, knowledge about the required paths, and applied filters of the query is leveraged to ensure that the mutated data is still a valid member of the query. For example, a contact should only be inserted into the cache of the following query, if its ticket number is less than 100, and if it defines values for `id` and `username`.

```tsx
const { data, error } = useQuery(
  client.from('contact').select(`id,username`).lt('ticket_number', 100)
)
```

Note that the exemplary upsert mutation above only selects `id` and `username`, and there is no way to know whether it would be a valid member of the query that filters on `ticket_number`. To ensure that every mutation returns all data required to make relevant updates to the cache, cache helpers, **by default**, auto-expands the query. Before the request is being made, all cache keys are scanned for queries on the same table, and the `.select()` statement is expanded to include all paths that any query selects or filters on. Note that this works for any valid PostgREST query, no matter the complexity. For the example above, the actual select statement of the request will be `id,username,ticket_number`. Since this can have a performance impact, you can opt-out of this feature on a per-mutation level.

After the mutation request returns the data, the entire query cache is searched for keys that target the same schema and table as the mutation itself. For each key, the input is checked against a set of conditions that depend on the type of operation to decide whether to mutate the cache for that key. During mutation, all relevant information about the query is observed, including `.limit()` filters and `.order()` modifiers. If you have a paginated table with contacts ordered by `username`, the new contact will be inserted in the same position as it is when the query is fetched from the server.

The fine-grained cache update is enabled by `PostgrestFilter`, which takes the parsed query key and creates filter functions to evaluate whether an object is valid given the query filters (`applyFilters`) and select statements (`hasPaths`). For the above example, `hasPaths` returns `true` if the input object returned by the mutation defines values for `id`, `username`, and `ticket_number`. For `applyFilters` to return `true`, the input object must define a `ticket_number` which is less than 100. If the input has no value for the path that the query filters for, `false` is returned. Note that both methods work with queries of any complexity:

```tsx
const filter = PostgrestFilter.fromFilterBuilder(
  supabase
    .from('contact')
    .select(
      'id,username,ticket_number,golden_ticket,tags,country!inner(code,name,full_name)'
    )
    .or(`username.eq.unknown,and(ticket_number.eq.2,golden_ticket.is.true)`)
    .is('golden_ticket', true)
    .in('username', ['thorwebdev'])
    .contains('tags', ['supateam'])
    .or('name.eq.unknown,and(name.eq.Singapore,code.eq.SG)', {
      foreignTable: 'country',
    })
)
console.log(
  filter.apply({
    id: '68d2e5ef-d117-4f0c-abc7-60891a643571',
    username: 'thorwebdev',
    ticket_number: 2,
    golden_ticket: false,
    tags: ['supateam', 'investor'],
    country: {
      code: 'SG',
      name: 'Singapore',
      full_name: 'Republic of Singapore',
    },
  })
) // --> false
console.log(
  filter.apply({
    id: '68d2e5ef-d117-4f0c-abc7-60891a643571',
    created_at: '2022-08-19T15:30:33.072441+00:00',
    username: 'thorwebdev',
    ticket_number: 2,
    golden_ticket: true,
    tags: ['supateam', 'investor'],
    country: {
      code: 'SG',
      name: 'Singapore',
      full_name: 'Republic of Singapore',
    },
  })
) // --> true
```

Internally, `PostgrestFilter` implements all operators supported by PostgREST in JavaScript. Undoubtedly, it will not be able to perfectly replicate the behavior of Postgres. However, it seems to be good enough for this use case and we have been using the Cache Helpers successfully in production for months now.

## What's next

At the moment, only SWR and React Query are supported. However, all the logic is split into framework-independent TypeScript packages, and I'd love to add adapters for other libraries and frameworks. If you are interested in collaborating, please [file an issue](https://github.com/psteinroe/supabase-cache-helpers/issues) or contact me directly!
