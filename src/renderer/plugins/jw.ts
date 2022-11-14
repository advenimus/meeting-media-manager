import { join } from 'upath'
import { Plugin } from '@nuxt/types'
import { ipcRenderer } from 'electron'
// eslint-disable-next-line import/named
import { existsSync, readFileSync } from 'fs-extra'
import { Filter, JWLang, ShortJWLang } from '~/types'

const plugin: Plugin = (
  {
    $appPath,
    $write,
    $getPrefs,
    $ytPath,
    $log,
    $warn,
    $setPrefs,
    $dayjs,
    store,
  },
  inject
) => {
  inject('getJWLangs', async (forceReload = false): Promise<ShortJWLang[]> => {
    const langPath = join($appPath(), 'langs.json')
    const lastUpdate = $getPrefs('media.langUpdatedLast') as string
    const recentlyUpdated =
      lastUpdate && $dayjs(lastUpdate).isAfter($dayjs().subtract(3, 'months'))

    if (forceReload || !existsSync(langPath) || !recentlyUpdated) {
      try {
        const result = await ipcRenderer.invoke('getFromJWOrg', {
          url: 'https://www.jw.org/en/languages',
        })
        const langs = (result.languages as JWLang[])
          .filter((lang) => lang.hasWebContent)
          .map((lang) => {
            return {
              name: lang.name,
              langcode: lang.langcode,
              symbol: lang.symbol,
              vernacularName: lang.vernacularName,
              isSignLanguage: lang.isSignLanguage,
            } as ShortJWLang
          })
        $write(langPath, JSON.stringify(langs, null, 2))
        $setPrefs('media.langUpdatedLast', $dayjs().toISOString())
      } catch (e: unknown) {
        if (!store.state.stats.online) {
          $warn('errorOffline')
        } else {
          $log.error(e)
        }
      }
    }

    let langs: ShortJWLang[] = []

    try {
      langs = JSON.parse(
        readFileSync(langPath, 'utf8') ?? '[]'
      ) as ShortJWLang[]
    } catch (e: unknown) {
      $log.error(e)
    }

    const mediaLang = $getPrefs('media.lang') as string
    const langPrefInLangs = langs.find((lang) => lang.langcode === mediaLang)

    // Check current lang if it hasn't been checked yet
    if (
      mediaLang &&
      langPrefInLangs &&
      (langPrefInLangs.mwbAvailable === undefined ||
        langPrefInLangs.mwbAvailable === undefined)
    ) {
      const availability = await getPubAvailability(mediaLang)
      langPrefInLangs.wAvailable = availability.w
      langPrefInLangs.mwbAvailable = availability.mwb
    }

    store.commit('media/setMediaLang', langPrefInLangs ?? null)
    store.commit(
      'media/setSongPub',
      langPrefInLangs?.isSignLanguage ? 'sjj' : 'sjjm'
    )

    $write(langPath, JSON.stringify(langs, null, 2))

    return langs
  })

  async function getPubAvailability(
    lang: string,
    refresh = false
  ): Promise<{ lang: string; w?: boolean; mwb?: boolean }> {
    let mwb
    let w

    $log.debug(`Checking availability of ${lang}`)

    const url = (cat: string, filter: string, lang: string) =>
      `https://www.jw.org/en/library/${cat}/json/filters/${filter}/?contentLanguageFilter=${lang}`

    try {
      const langPath = join($appPath(), 'langs.json')
      const langs = JSON.parse(
        readFileSync(langPath, 'utf8') ?? '[]'
      ) as ShortJWLang[]

      const langObject = langs.find((l) => l.langcode === lang)
      if (!langObject) return { lang, w, mwb }
      if (
        !refresh &&
        langObject.mwbAvailable !== undefined &&
        langObject.wAvailable !== undefined
      ) {
        return { lang, w: langObject.wAvailable, mwb: langObject.mwbAvailable }
      }

      const wAvailabilityEndpoint = url(
        'magazines',
        'MagazineViewsFilter',
        langObject.symbol
      )
      const mwbAvailabilityEndpoint = url(
        'jw-meeting-workbook',
        'IssueYearViewsFilter',
        langObject.symbol
      )

      const result = await Promise.allSettled([
        ipcRenderer.invoke('getFromJWOrg', {
          url: mwbAvailabilityEndpoint,
        }) as Promise<Filter>,
        ipcRenderer.invoke('getFromJWOrg', {
          url: wAvailabilityEndpoint,
        }) as Promise<Filter>,
      ])

      const mwbResult = result[0]
      const wResult = result[1]

      if (mwbResult.status === 'fulfilled') {
        mwb = !!mwbResult.value.choices.find(
          (c) => c.optionValue === new Date().getFullYear()
        )
      }
      if (wResult.status === 'fulfilled') {
        w = !!wResult.value.choices.find((c) => c.optionValue === 'w')
      }

      langObject.mwbAvailable = mwb
      langObject.wAvailable = w
      $write(langPath, JSON.stringify(langs, null, 2))
    } catch (e: unknown) {
      $log.error(e)
    }

    return { lang, mwb, w }
  }

  inject('getPubAvailability', getPubAvailability)

  // Get yeartext from WT online library
  inject('getYearText', async (force = false): Promise<string | null> => {
    let yeartext = null
    const ytPath = $ytPath()

    if (store.state.stats.online && (force || !existsSync(ytPath))) {
      try {
        const result = await ipcRenderer.invoke('getFromJWOrg', {
          url: 'https://wol.jw.org/wol/finder',
          params: {
            docid: `110${new Date().getFullYear()}800`,
            wtlocale: $getPrefs('media.lang') ?? 'E',
            format: 'json',
            snip: 'yes',
          },
        })
        if (result.content) {
          yeartext = JSON.parse(JSON.stringify(result.content)) as string
          $write(ytPath, yeartext)
        }
      } catch (e: unknown) {
        $log.error(e)
      }
    } else {
      try {
        yeartext = readFileSync(ytPath, 'utf8')
      } catch (e: unknown) {
        $warn('errorOffline')
      }
    }
    return yeartext
  })
}

export default plugin
