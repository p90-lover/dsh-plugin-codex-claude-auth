import type {
  Api,
  ApiKeyAuth,
  Model,
  Provider,
} from '@earendil-works/pi-ai'

function explicitTokenAuth(name: string): ApiKeyAuth {
  return {
    name: `${name} OAuth access token`,
    resolve: ({ credential }) => Promise.resolve(credential?.key === undefined
      ? undefined
      : { auth: { apiKey: credential.key }, source: 'Harness OAuth store' }),
  }
}

function withProvider(model: Model<Api>, provider: string): Model<Api> {
  return { ...model, provider }
}

/**
 * Re-key a pi-ai provider for one Harness route. The wrapped request restores
 * the upstream provider id before dispatch, while auth accepts the access token
 * that the separate OAuth-aware Models collection resolved and refreshed.
 */
export function routedProvider(base: Provider, route: string, displayName: string): Provider {
  const routeModel = (model: Model<Api>): Model<Api> => withProvider(model, route)
  const baseModel = (model: Model<Api>): Model<Api> => withProvider(model, base.id)
  return {
    id: route,
    name: displayName,
    ...base.baseUrl === undefined ? {} : { baseUrl: base.baseUrl },
    ...base.headers === undefined ? {} : { headers: base.headers },
    auth: {
      ...base.auth,
      apiKey: explicitTokenAuth(displayName),
    },
    getModels: () => base.getModels().map(routeModel),
    ...base.filterModels === undefined
      ? {}
      : {
          filterModels: (models, credential) => base.filterModels?.(models.map(baseModel), credential)
            .map(routeModel) ?? [],
        },
    stream: (model, context, options) => base.stream(baseModel(model), context, options),
    streamSimple: (model, context, options) => base.streamSimple(baseModel(model), context, options),
  }
}
