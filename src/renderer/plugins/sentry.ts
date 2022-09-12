import Vue from 'vue'
import * as Sentry from '@sentry/vue'
import { BrowserTracing } from '@sentry/tracing'
import { Plugin } from '@nuxt/types'

const plugin: Plugin = ({ $config, app }, inject) => {
  Sentry.init({
    Vue,
    dsn: $config.sentryDSN,
    enabled: $config.sentryEnabled,
    release: `meeting-media-manager@${
      $config.isDev ? 'dev' : $config.version.substring(1)
    }`,
    environment: $config.isDev ? 'development' : 'production',
    integrations: app.router
      ? [
          new BrowserTracing({
            routingInstrumentation: Sentry.vueRouterInstrumentation(app.router),
            tracingOrigins: ['localhost', 'my-site-url.com', /^\//],
          }),
        ]
      : [],
    tracesSampleRate: $config.isDev ? 1.0 : 0.1,
  })
  inject('sentry', Sentry)
}

export default plugin
