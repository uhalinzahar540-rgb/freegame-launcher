import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { CatalogPage } from '@/views/Catalog/CatalogPage'
import { DownloadsPage } from '@/views/Downloads/DownloadsPage'
import { GameDetailsPage } from '@/views/GameDetails/GameDetailsPage'
import { HomePage } from '@/views/Home/HomePage'
import { LibraryPage } from '@/views/Library/LibraryPage'
import { SettingsPage } from '@/views/Settings/SettingsPage'
import { UpdatesPage } from '@/views/Updates/UpdatesPage'
import { useLauncherStore } from '@/stores/launcher-store'

export function App() {
  const init = useLauncherStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="game/:gameId" element={<GameDetailsPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="updates" element={<UpdatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
