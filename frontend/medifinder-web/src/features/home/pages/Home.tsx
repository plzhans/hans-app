import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useLangPath } from '@/shared/i18n/routing';

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const path = useLangPath();
  const [keyword, setKeyword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = keyword.trim();
    // 접두사를 붙여 보낸다. 안 붙이면 영어 페이지에서 검색했는데 한국어 검색으로 튕긴다.
    navigate(path(q ? `/search?q=${encodeURIComponent(q)}` : '/search'));
  }

  return (
    <section className="flex flex-col items-center px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t('home.heroTitle')}</h1>
      <p className="mt-3 max-w-md text-slate-500">{t('home.heroSubtitle')}</p>

      <form onSubmit={onSubmit} className="mt-8 flex w-full max-w-lg gap-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('home.searchPlaceholder')}
          aria-label={t('home.searchPlaceholder')}
        />
        <Button type="submit" className="shrink-0">
          <Search className="h-4 w-4" />
          {t('home.searchButton')}
        </Button>
      </form>
    </section>
  );
}
