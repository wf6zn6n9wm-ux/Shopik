import { Header } from "@/components/Header";
import { PromoBanner } from "@/components/PromoBanner";
import { Hero } from "@/components/Hero";
import { Courses } from "@/components/Courses";
import { WhyChoose } from "@/components/WhyChoose";
import { MoreThanPrep } from "@/components/MoreThanPrep";
import { Steps } from "@/components/Steps";
import { Reviews } from "@/components/Reviews";
import { Universities } from "@/components/Universities";
import { ExamSchedule } from "@/components/ExamSchedule";
import { Faq } from "@/components/Faq";
import { MoreQuestions } from "@/components/MoreQuestions";
import { CoursesSecondary } from "@/components/CoursesSecondary";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <PromoBanner />
      <Header />
      <main>
        <Hero />
        <Courses />
        <WhyChoose />
        <MoreThanPrep />
        <Steps />
        <Reviews />
        <Universities />
        <ExamSchedule />
        <Faq />
        <MoreQuestions />
        <CoursesSecondary />
      </main>
      <Footer />
    </>
  );
}
